// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Zolace token
/// @notice An ERC-20 with a fixed supply that takes a fee on each transfer and moves it to one
/// address, the fee collector. That is all it does: the payout to holders is not on this chain
/// (CONTRACT.md).
/// @dev What the owner can do: lower the fee, change the fee collector, change the fee-free list,
/// hand over or give up ownership. What nobody can do, because no such function exists: mint,
/// pause, block a wallet, move another wallet's tokens, or raise the fee.
contract ZolaceToken is ERC20, Ownable2Step {
    /// @notice The whole supply, minted once in the constructor. Nothing mints after that.
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    /// @notice The highest fee the token can ever take, in basis points (100 = 1%).
    uint16 public constant MAX_FEE_BPS = 100;

    uint256 private constant BPS = 10_000;

    /// @notice The fee on a transfer, in basis points. It can only go down.
    uint16 public feeBps;

    /// @notice Where the fee goes. A transfer to or from this address pays no fee.
    address public feeCollector;

    /// @notice Addresses that pay no fee, as sender or as receiver.
    mapping(address account => bool exempt) public isFeeExempt;

    event FeeChanged(uint16 previousFeeBps, uint16 newFeeBps);
    event FeeCollectorChanged(address indexed previousCollector, address indexed newCollector);
    event FeeExemptChanged(address indexed account, bool exempt);

    error FeeAboveCeiling(uint16 feeBps, uint16 ceiling);
    error FeeCanOnlyGoDown(uint16 currentFeeBps, uint16 requestedFeeBps);
    error FeeCollectorIsZero();

    /// @param initialOwner Receives the whole supply and the owner's rights, and pays no fee
    /// until the owner takes it off the fee-free list.
    /// @param initialFeeCollector Where the fee goes.
    /// @param initialFeeBps The fee at the start, at most MAX_FEE_BPS.
    constructor(address initialOwner, address initialFeeCollector, uint16 initialFeeBps)
        ERC20("Zolace", "ZOLACE")
        Ownable(initialOwner)
    {
        if (initialFeeCollector == address(0)) revert FeeCollectorIsZero();
        if (initialFeeBps > MAX_FEE_BPS) revert FeeAboveCeiling(initialFeeBps, MAX_FEE_BPS);

        feeBps = initialFeeBps;
        emit FeeChanged(0, initialFeeBps);

        feeCollector = initialFeeCollector;
        emit FeeCollectorChanged(address(0), initialFeeCollector);

        isFeeExempt[initialOwner] = true;
        emit FeeExemptChanged(initialOwner, true);

        _mint(initialOwner, TOTAL_SUPPLY);
    }

    /// @notice Lowers the fee. A fee that is not lower than the current one is refused, so the
    /// fee can reach zero and can never come back up.
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        uint16 current = feeBps;
        if (newFeeBps >= current) revert FeeCanOnlyGoDown(current, newFeeBps);
        feeBps = newFeeBps;
        emit FeeChanged(current, newFeeBps);
    }

    /// @notice Changes where the fee goes.
    function setFeeCollector(address newFeeCollector) external onlyOwner {
        if (newFeeCollector == address(0)) revert FeeCollectorIsZero();
        emit FeeCollectorChanged(feeCollector, newFeeCollector);
        feeCollector = newFeeCollector;
    }

    /// @notice Puts an address on the fee-free list or takes it off.
    function setFeeExempt(address account, bool exempt) external onlyOwner {
        isFeeExempt[account] = exempt;
        emit FeeExemptChanged(account, exempt);
    }

    /// @notice The fee a transfer of `value` from `from` to `to` would pay right now.
    /// The receiver gets `value` less this.
    function feeOn(address from, address to, uint256 value) public view returns (uint256) {
        address collector = feeCollector;
        if (from == collector || to == collector) return 0;
        if (isFeeExempt[from] || isFeeExempt[to]) return 0;
        // Rounded down, so a transfer too small for the fee to reach one unit pays none.
        return (value * feeBps) / BPS;
    }

    /// @dev Every movement of the token passes through here (transfer, transferFrom, and the one
    /// mint in the constructor). A transfer becomes two movements: the fee to the collector and
    /// the rest to the receiver. Together they are exactly `value`, so no token is made or lost.
    function _update(address from, address to, uint256 value) internal override {
        // The mint has no sender to charge. Nothing burns: the token has no burn function.
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = feeOn(from, to, value);
        if (fee == 0) {
            super._update(from, to, value);
            return;
        }

        super._update(from, feeCollector, fee);
        super._update(from, to, value - fee);
    }
}
