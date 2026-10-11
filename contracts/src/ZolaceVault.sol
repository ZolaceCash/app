// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Zolace vault
/// @notice Holds the reward that holders of the Zolace token claim, one month at a time. For each
/// month the owner puts the reward in together with the root of a list of who gets how much. A
/// wallet on that list takes its part with a proof that it is on it.
/// @dev The list itself is worked out off the chain, from the token's public transfers, and
/// published, so anyone can check a root against it (CONTRACT.md). What this contract makes sure
/// of is narrower: what was put in for a month can only leave to wallets on that month's list, in
/// the amounts on it, once each. The owner can fund a month. The owner cannot take anything back
/// out, change a month, or stop a claim: no such function exists.
contract ZolaceVault is Ownable2Step {
    using SafeERC20 for IERC20;

    /// @notice The token the reward is paid in.
    IERC20 public immutable reward;

    struct Month {
        bytes32 root;
        uint256 total;
        uint256 claimed;
    }

    /// @notice A month by its number, written as the year and the month: 202609 is September 2026.
    mapping(uint32 period => Month month) public months;

    /// @notice Whether a wallet has taken its part of a month.
    mapping(uint32 period => mapping(address account => bool taken)) public hasClaimed;

    event Funded(uint32 indexed period, bytes32 root, uint256 total);
    event Claimed(uint32 indexed period, address indexed account, uint256 amount);

    error RewardIsZero();
    error NothingToFund();
    error AlreadyFunded(uint32 period);
    error ShortFunded(uint256 expected, uint256 received);
    error NotFunded(uint32 period);
    error AlreadyClaimed(uint32 period, address account);
    error NotOnTheList();
    error OverTheTotal(uint32 period);

    constructor(address initialOwner, IERC20 rewardToken) Ownable(initialOwner) {
        if (address(rewardToken) == address(0)) revert RewardIsZero();
        reward = rewardToken;
    }

    /// @notice Puts a month's reward in, with the root of its list. Once per month, for good: a
    /// funded month cannot be changed or funded again. The reward is pulled from the caller, who
    /// has to have approved it first.
    function fund(uint32 period, bytes32 root, uint256 total) external onlyOwner {
        if (root == bytes32(0) || total == 0) revert NothingToFund();
        if (months[period].root != bytes32(0)) revert AlreadyFunded(period);

        months[period] = Month({root: root, total: total, claimed: 0});

        // A token that keeps part of a transfer for itself would leave the month short of what
        // its list promises. Refuse it here rather than fail the last claims.
        uint256 before = reward.balanceOf(address(this));
        reward.safeTransferFrom(msg.sender, address(this), total);
        uint256 received = reward.balanceOf(address(this)) - before;
        if (received != total) revert ShortFunded(total, received);

        emit Funded(period, root, total);
    }

    /// @notice Pays `account` its part of a month. Anyone may send this for any account: the
    /// reward only ever goes to the account on the list, never to the caller.
    /// @param proof The hashes that tie this account and amount to the month's root.
    function claim(uint32 period, address account, uint256 amount, bytes32[] calldata proof) external {
        Month storage month = months[period];
        if (month.root == bytes32(0)) revert NotFunded(period);
        if (hasClaimed[period][account]) revert AlreadyClaimed(period, account);
        if (!MerkleProof.verify(proof, month.root, leafOf(period, account, amount))) revert NotOnTheList();

        hasClaimed[period][account] = true;
        month.claimed += amount;
        // A root whose list adds up to more than was put in cannot reach into another month.
        if (month.claimed > month.total) revert OverTheTotal(period);

        reward.safeTransfer(account, amount);
        emit Claimed(period, account, amount);
    }

    /// @notice One line of a month's list, as it is hashed into the root. Hashed twice, so a line
    /// can never be mistaken for a pair of hashes inside the tree.
    function leafOf(uint32 period, address account, uint256 amount) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(period, account, amount))));
    }
}
