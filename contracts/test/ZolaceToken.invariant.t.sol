// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";

import {ZolaceToken} from "../src/ZolaceToken.sol";

// Makes the calls anyone could make, in any order: transfers between a fixed set of wallets, and
// the owner changing every rule the owner can change. The tokens never leave that set of wallets,
// so their balances can be added up and held against the supply.
contract ZolaceTokenHandler is Test {
    ZolaceToken public immutable token;
    address public immutable owner;
    address[] public wallets;

    // The fee as it was after the last call, to catch a fee that went up.
    uint16 public lastFeeBps;
    bool public feeWentUp;

    constructor(ZolaceToken token_, address owner_, address[] memory wallets_) {
        token = token_;
        owner = owner_;
        wallets = wallets_;
        lastFeeBps = token_.feeBps();
    }

    function walletCount() external view returns (uint256) {
        return wallets.length;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _wallet(fromSeed);
        address to = _wallet(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));

        uint256 fee = token.feeOn(from, to, amount);
        address collector = token.feeCollector();
        uint256 collectorBefore = token.balanceOf(collector);
        uint256 toBefore = token.balanceOf(to);

        vm.prank(from);
        token.transfer(to, amount);

        // Each transfer on its own: the receiver and the collector gain exactly what was sent.
        if (from != to && from != collector && to != collector) {
            assertEq(token.balanceOf(to), toBefore + amount - fee);
            assertEq(token.balanceOf(collector), collectorBefore + fee);
        }
        _noteFee();
    }

    function transferFrom(uint256 fromSeed, uint256 toSeed, uint256 spenderSeed, uint256 amount) external {
        address from = _wallet(fromSeed);
        address to = _wallet(toSeed);
        address spender = _wallet(spenderSeed);
        amount = bound(amount, 0, token.balanceOf(from));

        vm.prank(from);
        token.approve(spender, amount);
        vm.prank(spender);
        token.transferFrom(from, to, amount);

        assertEq(token.allowance(from, spender), 0);
        _noteFee();
    }

    function lowerFee(uint16 newFeeBps) external {
        uint16 current = token.feeBps();
        if (current == 0) return;
        newFeeBps = uint16(bound(newFeeBps, 0, current - 1));
        vm.prank(owner);
        token.setFeeBps(newFeeBps);
        _noteFee();
    }

    function tryToRaiseFee(uint16 newFeeBps) external {
        uint16 current = token.feeBps();
        newFeeBps = uint16(bound(newFeeBps, current, type(uint16).max));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, current, newFeeBps));
        token.setFeeBps(newFeeBps);
        _noteFee();
    }

    function setFeeExempt(uint256 seed, bool exempt) external {
        vm.prank(owner);
        token.setFeeExempt(_wallet(seed), exempt);
    }

    function setFeeCollector(uint256 seed) external {
        vm.prank(owner);
        token.setFeeCollector(_wallet(seed));
    }

    function _wallet(uint256 seed) private view returns (address) {
        return wallets[bound(seed, 0, wallets.length - 1)];
    }

    function _noteFee() private {
        uint16 current = token.feeBps();
        if (current > lastFeeBps) feeWentUp = true;
        lastFeeBps = current;
    }
}

contract ZolaceTokenInvariantTest is Test {
    ZolaceToken token;
    ZolaceTokenHandler handler;

    address owner = makeAddr("owner");

    function setUp() public {
        address[] memory wallets = new address[](6);
        wallets[0] = owner;
        wallets[1] = makeAddr("collector");
        wallets[2] = makeAddr("alice");
        wallets[3] = makeAddr("bob");
        wallets[4] = makeAddr("carol");
        wallets[5] = makeAddr("dave");

        token = new ZolaceToken(owner, wallets[1], 100);

        // Spread the supply, so every wallet has something to send from the first call.
        vm.startPrank(owner);
        for (uint256 i = 2; i < wallets.length; i++) {
            token.transfer(wallets[i], 100_000_000e18);
        }
        vm.stopPrank();

        handler = new ZolaceTokenHandler(token, owner, wallets);
        targetContract(address(handler));
    }

    function invariant_TheSupplyNeverChanges() public view {
        assertEq(token.totalSupply(), token.TOTAL_SUPPLY());
    }

    function invariant_AllBalancesTogetherAreTheSupply() public view {
        uint256 sum;
        uint256 count = handler.walletCount();
        for (uint256 i = 0; i < count; i++) {
            sum += token.balanceOf(handler.wallets(i));
        }
        assertEq(sum, token.TOTAL_SUPPLY());
    }

    function invariant_TheFeeStaysUnderTheCeilingAndNeverRises() public view {
        assertLe(token.feeBps(), token.MAX_FEE_BPS());
        assertLe(token.feeBps(), 100);
        assertFalse(handler.feeWentUp());
    }

    function invariant_ThereIsAlwaysAFeeCollector() public view {
        assertTrue(token.feeCollector() != address(0));
    }
}
