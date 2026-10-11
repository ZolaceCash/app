// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {ZolaceToken} from "../src/ZolaceToken.sol";

// What CONTRACT.md says the tests have to prove, one case at a time. The same claims are checked
// against random sequences of calls in ZolaceToken.invariant.t.sol.
contract ZolaceTokenTest is Test {
    ZolaceToken token;

    address owner = makeAddr("owner");
    address collector = makeAddr("collector");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address stranger = makeAddr("stranger");

    uint16 constant FEE_BPS = 100;
    uint256 constant ALICE_START = 10_000_000e18;

    event FeeChanged(uint16 previousFeeBps, uint16 newFeeBps);
    event FeeCollectorChanged(address indexed previousCollector, address indexed newCollector);
    event FeeExemptChanged(address indexed account, bool exempt);

    function setUp() public {
        token = new ZolaceToken(owner, collector, FEE_BPS);
        // The owner is fee-free, so alice starts with a round number.
        vm.prank(owner);
        token.transfer(alice, ALICE_START);
    }

    // ---- deployment

    function test_DeploymentMintsTheWholeSupplyToTheOwner() public {
        ZolaceToken fresh = new ZolaceToken(owner, collector, FEE_BPS);
        assertEq(fresh.totalSupply(), 1_000_000_000e18);
        assertEq(fresh.totalSupply(), fresh.TOTAL_SUPPLY());
        assertEq(fresh.balanceOf(owner), fresh.TOTAL_SUPPLY());
        assertEq(fresh.balanceOf(collector), 0);
    }

    function test_DeploymentSetsTheNameTheFeeAndTheRoles() public view {
        assertEq(token.name(), "Zolace");
        assertEq(token.symbol(), "ZOLACE");
        assertEq(token.decimals(), 18);
        assertEq(token.owner(), owner);
        assertEq(token.feeBps(), FEE_BPS);
        assertEq(token.MAX_FEE_BPS(), 100);
        assertEq(token.feeCollector(), collector);
        assertTrue(token.isFeeExempt(owner));
        assertFalse(token.isFeeExempt(alice));
    }

    function test_DeploymentRefusesAFeeAboveTheCeiling() public {
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeAboveCeiling.selector, uint16(101), uint16(100)));
        new ZolaceToken(owner, collector, 101);
    }

    function test_DeploymentRefusesNoFeeCollector() public {
        vm.expectRevert(ZolaceToken.FeeCollectorIsZero.selector);
        new ZolaceToken(owner, address(0), FEE_BPS);
    }

    function test_DeploymentRefusesNoOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new ZolaceToken(address(0), collector, FEE_BPS);
    }

    // ---- the fee

    function test_TransferSendsTheFeeToTheCollectorAndTheRestToTheReceiver() public {
        vm.prank(alice);
        token.transfer(bob, 1_000e18);

        assertEq(token.balanceOf(alice), ALICE_START - 1_000e18);
        assertEq(token.balanceOf(bob), 990e18);
        assertEq(token.balanceOf(collector), 10e18);
        assertEq(token.totalSupply(), token.TOTAL_SUPPLY());
    }

    function test_TransferFromTakesTheSameFeeAndSpendsTheWholeAllowance() public {
        vm.prank(alice);
        token.approve(stranger, 1_000e18);

        vm.prank(stranger);
        token.transferFrom(alice, bob, 1_000e18);

        assertEq(token.balanceOf(alice), ALICE_START - 1_000e18);
        assertEq(token.balanceOf(bob), 990e18);
        assertEq(token.balanceOf(collector), 10e18);
        assertEq(token.allowance(alice, stranger), 0);
    }

    function test_FeeOnSaysWhatATransferWillPay() public view {
        assertEq(token.feeOn(alice, bob, 1_000e18), 10e18);
        assertEq(token.feeOn(owner, bob, 1_000e18), 0);
        assertEq(token.feeOn(alice, owner, 1_000e18), 0);
        assertEq(token.feeOn(alice, collector, 1_000e18), 0);
        assertEq(token.feeOn(collector, alice, 1_000e18), 0);
    }

    function test_AFeeFreeAddressPaysNothingAsSenderOrReceiver() public {
        vm.prank(owner);
        token.setFeeExempt(bob, true);

        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(bob), 1_000e18);

        vm.prank(bob);
        token.transfer(alice, 400e18);
        assertEq(token.balanceOf(alice), ALICE_START - 600e18);
        assertEq(token.balanceOf(collector), 0);
    }

    function test_TakenOffTheFeeFreeListAnAddressPaysAgain() public {
        vm.startPrank(owner);
        token.setFeeExempt(bob, true);
        token.setFeeExempt(bob, false);
        vm.stopPrank();

        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(bob), 990e18);
    }

    function test_TransfersToAndFromTheCollectorPayNoFee() public {
        vm.prank(alice);
        token.transfer(collector, 1_000e18);
        assertEq(token.balanceOf(collector), 1_000e18);

        vm.prank(collector);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(bob), 1_000e18);
        assertEq(token.balanceOf(collector), 0);
    }

    // ---- the edges

    function test_ATransferOfZeroMovesNothing() public {
        vm.prank(alice);
        token.transfer(bob, 0);
        assertEq(token.balanceOf(alice), ALICE_START);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(collector), 0);
    }

    function test_ATransferTooSmallForTheFeePaysNone() public {
        // 99 units at 1% is less than one unit, and the fee is rounded down.
        vm.prank(alice);
        token.transfer(bob, 99);
        assertEq(token.balanceOf(bob), 99);
        assertEq(token.balanceOf(collector), 0);

        vm.prank(alice);
        token.transfer(bob, 100);
        assertEq(token.balanceOf(bob), 99 + 99);
        assertEq(token.balanceOf(collector), 1);
    }

    function test_ATransferToOneselfCostsTheFee() public {
        vm.prank(alice);
        token.transfer(alice, 1_000e18);
        assertEq(token.balanceOf(alice), ALICE_START - 10e18);
        assertEq(token.balanceOf(collector), 10e18);
    }

    function test_AWholeBalanceCanBeSent() public {
        vm.prank(alice);
        token.transfer(bob, ALICE_START);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), ALICE_START - ALICE_START / 100);
        assertEq(token.balanceOf(collector), ALICE_START / 100);
    }

    function test_MoreThanTheBalanceIsRefusedAndNothingMoves() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector,
                alice,
                // The fee leaves first, so the balance is short for what is left to send.
                ALICE_START - (ALICE_START + 1) / 100,
                (ALICE_START + 1) - (ALICE_START + 1) / 100
            )
        );
        token.transfer(bob, ALICE_START + 1);

        assertEq(token.balanceOf(alice), ALICE_START);
        assertEq(token.balanceOf(collector), 0);
    }

    function test_MoreThanTheAllowanceIsRefused() public {
        vm.prank(alice);
        token.approve(stranger, 999e18);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, stranger, 999e18, 1_000e18)
        );
        token.transferFrom(alice, bob, 1_000e18);
    }

    // ---- the owner's functions

    function test_TheOwnerCanLowerTheFee() public {
        vm.expectEmit(address(token));
        emit FeeChanged(100, 40);
        vm.prank(owner);
        token.setFeeBps(40);
        assertEq(token.feeBps(), 40);

        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(collector), 4e18);
    }

    function test_TheFeeCannotBeRaisedOrKept() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, uint16(100), uint16(101)));
        token.setFeeBps(101);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, uint16(100), uint16(100)));
        token.setFeeBps(100);

        token.setFeeBps(50);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, uint16(50), uint16(100)));
        token.setFeeBps(100);
        vm.stopPrank();
    }

    function test_AFeeOfZeroStaysZero() public {
        vm.startPrank(owner);
        token.setFeeBps(0);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, uint16(0), uint16(0)));
        token.setFeeBps(0);
        vm.expectRevert(abi.encodeWithSelector(ZolaceToken.FeeCanOnlyGoDown.selector, uint16(0), uint16(1)));
        token.setFeeBps(1);
        vm.stopPrank();

        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(bob), 1_000e18);
    }

    function test_TheOwnerCanChangeTheCollector() public {
        address next = makeAddr("next collector");

        vm.expectEmit(address(token));
        emit FeeCollectorChanged(collector, next);
        vm.prank(owner);
        token.setFeeCollector(next);

        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(next), 10e18);
        assertEq(token.balanceOf(collector), 0);
    }

    function test_TheCollectorCannotBeNobody() public {
        vm.prank(owner);
        vm.expectRevert(ZolaceToken.FeeCollectorIsZero.selector);
        token.setFeeCollector(address(0));
    }

    function test_AChangeToTheFeeFreeListIsAnEvent() public {
        vm.expectEmit(address(token));
        emit FeeExemptChanged(bob, true);
        vm.prank(owner);
        token.setFeeExempt(bob, true);
    }

    function test_OnlyTheOwnerCanCallTheOwnersFunctions() public {
        bytes memory refused = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger);

        vm.startPrank(stranger);
        vm.expectRevert(refused);
        token.setFeeBps(0);
        vm.expectRevert(refused);
        token.setFeeCollector(stranger);
        vm.expectRevert(refused);
        token.setFeeExempt(stranger, true);
        vm.expectRevert(refused);
        token.transferOwnership(stranger);
        vm.expectRevert(refused);
        token.renounceOwnership();
        vm.stopPrank();
    }

    function test_OwnershipMovesInTwoSteps() public {
        vm.prank(owner);
        token.transferOwnership(bob);
        assertEq(token.owner(), owner);
        assertEq(token.pendingOwner(), bob);

        // Until bob accepts, bob has no rights and nobody else can take them.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        token.setFeeBps(0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        token.acceptOwnership();

        vm.prank(bob);
        token.acceptOwnership();
        assertEq(token.owner(), bob);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        token.setFeeBps(0);
    }

    function test_GivingUpOwnershipFreezesTheRules() public {
        vm.prank(owner);
        token.renounceOwnership();
        assertEq(token.owner(), address(0));

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        token.setFeeBps(0);

        // The token still works, at the fee it had.
        vm.prank(alice);
        token.transfer(bob, 1_000e18);
        assertEq(token.balanceOf(bob), 990e18);
    }

    // ---- the same, for any amount and any fee

    function testFuzz_ATransferMovesExactlyItsAmount(uint256 amount, uint16 fee) public {
        amount = bound(amount, 0, ALICE_START);
        fee = uint16(bound(fee, 0, 100));
        if (fee < FEE_BPS) {
            vm.prank(owner);
            token.setFeeBps(fee);
        }

        uint256 expectedFee = (amount * token.feeBps()) / 10_000;
        assertEq(token.feeOn(alice, bob, amount), expectedFee);

        vm.prank(alice);
        token.transfer(bob, amount);

        assertEq(token.balanceOf(alice), ALICE_START - amount);
        assertEq(token.balanceOf(bob), amount - expectedFee);
        assertEq(token.balanceOf(collector), expectedFee);
        assertLe(expectedFee, amount / 100);
        assertEq(token.totalSupply(), token.TOTAL_SUPPLY());
    }

    function testFuzz_NobodyButTheOwnerChangesTheRules(address caller, uint16 fee, address target, bool flag) public {
        vm.assume(caller != owner);
        bytes memory refused = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller);

        vm.startPrank(caller);
        vm.expectRevert(refused);
        token.setFeeBps(fee);
        vm.expectRevert(refused);
        token.setFeeCollector(target);
        vm.expectRevert(refused);
        token.setFeeExempt(target, flag);
        vm.stopPrank();
    }
}
