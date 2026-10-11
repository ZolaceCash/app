// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ZolaceVault} from "../src/ZolaceVault.sol";

// A plain token that stands in for the reward.
contract RewardToken is ERC20 {
    constructor() ERC20("Reward", "RWD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// A token that keeps a hundredth of every transfer, to show the vault refuses such a reward.
contract SkimmingToken is ERC20 {
    constructor() ERC20("Skim", "SKM") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        super._update(from, address(0xdead), value / 100);
        super._update(from, to, value - value / 100);
    }
}

contract ZolaceVaultTest is Test {
    RewardToken reward;
    ZolaceVault vault;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address stranger = makeAddr("stranger");

    uint32 constant SEPTEMBER = 202609;
    uint32 constant OCTOBER = 202610;

    // September's list: three wallets, 100 in all.
    uint256 constant ALICE = 50e18;
    uint256 constant BOB = 30e18;
    uint256 constant CAROL = 20e18;
    uint256 constant TOTAL = 100e18;

    event Funded(uint32 indexed period, bytes32 root, uint256 total);
    event Claimed(uint32 indexed period, address indexed account, uint256 amount);

    function setUp() public {
        reward = new RewardToken();
        vault = new ZolaceVault(owner, reward);
        reward.mint(owner, 1_000e18);
        vm.prank(owner);
        reward.approve(address(vault), type(uint256).max);
    }

    // ---- a three-line list, built the way the site builds one: lines hashed, then pairs hashed
    // in sorted order, an odd one carried up as it is.

    function pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function lines(uint32 period) internal view returns (bytes32 a, bytes32 b, bytes32 c) {
        a = vault.leafOf(period, alice, ALICE);
        b = vault.leafOf(period, bob, BOB);
        c = vault.leafOf(period, carol, CAROL);
    }

    function rootOf(uint32 period) internal view returns (bytes32) {
        (bytes32 a, bytes32 b, bytes32 c) = lines(period);
        return pair(pair(a, b), c);
    }

    function proofFor(uint32 period, address account) internal view returns (bytes32[] memory proof) {
        (bytes32 a, bytes32 b, bytes32 c) = lines(period);
        if (account == carol) {
            proof = new bytes32[](1);
            proof[0] = pair(a, b);
            return proof;
        }
        proof = new bytes32[](2);
        proof[0] = account == alice ? b : a;
        proof[1] = c;
    }

    // The root is worked out first: a prank only covers the very next call, and working out a
    // root calls the vault.
    function fundAs(address who, uint32 period, uint256 total) internal {
        bytes32 root = rootOf(period);
        vm.prank(who);
        vault.fund(period, root, total);
    }

    function fundSeptember() internal {
        fundAs(owner, SEPTEMBER, TOTAL);
    }

    // ---- deployment

    function test_DeploymentKeepsTheRewardAndTheOwner() public view {
        assertEq(address(vault.reward()), address(reward));
        assertEq(vault.owner(), owner);
    }

    function test_DeploymentRefusesNoReward() public {
        vm.expectRevert(ZolaceVault.RewardIsZero.selector);
        new ZolaceVault(owner, IERC20(address(0)));
    }

    // ---- funding a month
    //
    // In these tests a root or a proof is always worked out into a variable first. Working one out
    // calls the vault, and `vm.prank` and `vm.expectRevert` only cover the very next call.

    function test_FundingPullsTheRewardInAndRecordsTheMonth() public {
        bytes32 root = rootOf(SEPTEMBER);
        vm.expectEmit(address(vault));
        emit Funded(SEPTEMBER, root, TOTAL);
        vm.prank(owner);
        vault.fund(SEPTEMBER, root, TOTAL);

        (bytes32 kept, uint256 total, uint256 claimed) = vault.months(SEPTEMBER);
        assertEq(kept, root);
        assertEq(total, TOTAL);
        assertEq(claimed, 0);
        assertEq(reward.balanceOf(address(vault)), TOTAL);
        assertEq(reward.balanceOf(owner), 900e18);
    }

    function test_OnlyTheOwnerCanFund() public {
        bytes32 root = rootOf(SEPTEMBER);
        reward.mint(stranger, TOTAL);
        vm.prank(stranger);
        reward.approve(address(vault), TOTAL);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        vault.fund(SEPTEMBER, root, TOTAL);
    }

    function test_AMonthIsFundedOnceAndCannotBeChanged() public {
        bytes32 root = rootOf(SEPTEMBER);
        fundSeptember();

        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.AlreadyFunded.selector, SEPTEMBER));
        vm.prank(owner);
        vault.fund(SEPTEMBER, root, TOTAL);

        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.AlreadyFunded.selector, SEPTEMBER));
        vm.prank(owner);
        vault.fund(SEPTEMBER, keccak256("another list"), 1);
    }

    function test_AnEmptyMonthIsRefused() public {
        bytes32 root = rootOf(SEPTEMBER);

        vm.expectRevert(ZolaceVault.NothingToFund.selector);
        vm.prank(owner);
        vault.fund(SEPTEMBER, bytes32(0), TOTAL);

        vm.expectRevert(ZolaceVault.NothingToFund.selector);
        vm.prank(owner);
        vault.fund(SEPTEMBER, root, 0);
    }

    function test_ARewardThatKeepsPartOfATransferIsRefused() public {
        SkimmingToken skim = new SkimmingToken();
        ZolaceVault skimVault = new ZolaceVault(owner, skim);
        skim.mint(owner, TOTAL);
        vm.prank(owner);
        skim.approve(address(skimVault), TOTAL);

        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.ShortFunded.selector, TOTAL, 99e18));
        vm.prank(owner);
        skimVault.fund(SEPTEMBER, keccak256("list"), TOTAL);
    }

    // ---- claiming

    function test_AWalletOnTheListTakesExactlyItsPart() public {
        fundSeptember();
        bytes32[] memory proof = proofFor(SEPTEMBER, alice);

        vm.expectEmit(address(vault));
        emit Claimed(SEPTEMBER, alice, ALICE);
        vm.prank(alice);
        vault.claim(SEPTEMBER, alice, ALICE, proof);

        assertEq(reward.balanceOf(alice), ALICE);
        assertEq(reward.balanceOf(address(vault)), TOTAL - ALICE);
        assertTrue(vault.hasClaimed(SEPTEMBER, alice));
        (, , uint256 claimed) = vault.months(SEPTEMBER);
        assertEq(claimed, ALICE);
    }

    function test_EveryoneOnTheListCanClaimAndTheMonthEmptiesExactly() public {
        fundSeptember();
        bytes32[] memory alices = proofFor(SEPTEMBER, alice);
        bytes32[] memory bobs = proofFor(SEPTEMBER, bob);
        bytes32[] memory carols = proofFor(SEPTEMBER, carol);
        vault.claim(SEPTEMBER, alice, ALICE, alices);
        vault.claim(SEPTEMBER, bob, BOB, bobs);
        vault.claim(SEPTEMBER, carol, CAROL, carols);

        assertEq(reward.balanceOf(alice), ALICE);
        assertEq(reward.balanceOf(bob), BOB);
        assertEq(reward.balanceOf(carol), CAROL);
        assertEq(reward.balanceOf(address(vault)), 0);
    }

    function test_AnyoneCanSendAClaimButTheRewardGoesToTheListedWallet() public {
        fundSeptember();
        bytes32[] memory proof = proofFor(SEPTEMBER, bob);
        vm.prank(stranger);
        vault.claim(SEPTEMBER, bob, BOB, proof);
        assertEq(reward.balanceOf(bob), BOB);
        assertEq(reward.balanceOf(stranger), 0);
    }

    function test_APartIsTakenOnce() public {
        fundSeptember();
        bytes32[] memory proof = proofFor(SEPTEMBER, alice);
        vault.claim(SEPTEMBER, alice, ALICE, proof);

        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.AlreadyClaimed.selector, SEPTEMBER, alice));
        vault.claim(SEPTEMBER, alice, ALICE, proof);
        assertEq(reward.balanceOf(alice), ALICE);
    }

    function test_AnotherAmountAnotherWalletOrAnotherProofIsRefused() public {
        fundSeptember();
        bytes32[] memory proof = proofFor(SEPTEMBER, alice);
        bytes32[] memory bobs = proofFor(SEPTEMBER, bob);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(SEPTEMBER, alice, ALICE + 1, proof);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(SEPTEMBER, stranger, ALICE, proof);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(SEPTEMBER, alice, ALICE, bobs);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(SEPTEMBER, alice, ALICE, new bytes32[](0));

        assertEq(reward.balanceOf(address(vault)), TOTAL);
    }

    function test_AMonthThatWasNotFundedPaysNothing() public {
        fundSeptember();
        bytes32[] memory proof = proofFor(SEPTEMBER, alice);
        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.NotFunded.selector, OCTOBER));
        vault.claim(OCTOBER, alice, ALICE, proof);
    }

    function test_AProofForOneMonthDoesNotWorkInAnother() public {
        fundSeptember();
        fundAs(owner, OCTOBER, TOTAL);
        bytes32[] memory september = proofFor(SEPTEMBER, alice);
        bytes32[] memory october = proofFor(OCTOBER, alice);

        // The same wallets and amounts, but each month hashes its own number into every line.
        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(OCTOBER, alice, ALICE, september);

        vault.claim(OCTOBER, alice, ALICE, october);
        vault.claim(SEPTEMBER, alice, ALICE, september);
        assertEq(reward.balanceOf(alice), 2 * ALICE);
    }

    function test_AListThatAddsUpToMoreThanWasPutInCannotReachAnotherMonth() public {
        fundSeptember();
        // October is funded with half of what its list promises.
        fundAs(owner, OCTOBER, 50e18);
        bytes32[] memory alices = proofFor(OCTOBER, alice);
        bytes32[] memory bobs = proofFor(OCTOBER, bob);

        vault.claim(OCTOBER, alice, ALICE, alices);
        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.OverTheTotal.selector, OCTOBER));
        vault.claim(OCTOBER, bob, BOB, bobs);

        // The reward put in for September is untouched and still claimable in full.
        assertEq(reward.balanceOf(address(vault)), TOTAL);
        bytes32[] memory a = proofFor(SEPTEMBER, alice);
        bytes32[] memory b = proofFor(SEPTEMBER, bob);
        bytes32[] memory c = proofFor(SEPTEMBER, carol);
        vault.claim(SEPTEMBER, bob, BOB, b);
        vault.claim(SEPTEMBER, carol, CAROL, c);
        vault.claim(SEPTEMBER, alice, ALICE, a);
        assertEq(reward.balanceOf(address(vault)), 0);
    }

    function test_AListOfOneWalletNeedsNoProof() public {
        bytes32 root = vault.leafOf(SEPTEMBER, alice, 7e18);
        vm.prank(owner);
        vault.fund(SEPTEMBER, root, 7e18);
        vault.claim(SEPTEMBER, alice, 7e18, new bytes32[](0));
        assertEq(reward.balanceOf(alice), 7e18);
    }

    // The two numbers below were worked out by the site's own code (lib/vault.ts) for this list,
    // and tests/vault.test.ts holds the site to them. A month funded with the site's root then
    // pays against a proof built the way the site builds one.
    function test_TheSiteAndTheContractHashAListTheSameWay() public {
        address first = address(0xa1);
        address second = address(0xb2);
        address third = address(0xc3);
        bytes32 siteLeaf = 0xc7ac3adac7bdafc55109eaf871f2ec5458a6b4c0ffe2a6af19a3a9709df42f73;
        bytes32 siteRoot = 0x49dd6bbaed9ae7aa66c1b6ff6ccffac99f98b0bb611d529d96fa040098231bf8;

        bytes32 a = vault.leafOf(SEPTEMBER, first, 500);
        bytes32 b = vault.leafOf(SEPTEMBER, second, 300);
        bytes32 c = vault.leafOf(SEPTEMBER, third, 150);
        assertEq(a, siteLeaf);
        assertEq(pair(pair(a, b), c), siteRoot);

        vm.prank(owner);
        vault.fund(SEPTEMBER, siteRoot, 950);

        bytes32[] memory forSecond = new bytes32[](2);
        forSecond[0] = a;
        forSecond[1] = c;
        vault.claim(SEPTEMBER, second, 300, forSecond);
        bytes32[] memory forThird = new bytes32[](1);
        forThird[0] = pair(a, b);
        vault.claim(SEPTEMBER, third, 150, forThird);
        assertEq(reward.balanceOf(second), 300);
        assertEq(reward.balanceOf(third), 150);
    }

    function test_GivingUpOwnershipEndsFundingAndLeavesClaimsOpen() public {
        bytes32 october = rootOf(OCTOBER);
        bytes32[] memory carols = proofFor(SEPTEMBER, carol);
        fundSeptember();
        vm.prank(owner);
        vault.renounceOwnership();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vm.prank(owner);
        vault.fund(OCTOBER, october, TOTAL);

        vault.claim(SEPTEMBER, carol, CAROL, carols);
        assertEq(reward.balanceOf(carol), CAROL);
    }

    // ---- for any amounts

    function testFuzz_ATwoLineListPaysExactlyWhatItSays(uint96 first, uint96 second) public {
        uint256 a = bound(uint256(first), 1, 400e18);
        uint256 b = bound(uint256(second), 1, 400e18);
        bytes32 lineA = vault.leafOf(SEPTEMBER, alice, a);
        bytes32 lineB = vault.leafOf(SEPTEMBER, bob, b);

        vm.prank(owner);
        vault.fund(SEPTEMBER, pair(lineA, lineB), a + b);

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lineB;
        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = lineA;

        vault.claim(SEPTEMBER, alice, a, proofA);
        vault.claim(SEPTEMBER, bob, b, proofB);

        assertEq(reward.balanceOf(alice), a);
        assertEq(reward.balanceOf(bob), b);
        assertEq(reward.balanceOf(address(vault)), 0);
    }

    function testFuzz_NobodyOffTheListGetsAnything(address account, uint256 amount, bytes32 guess) public {
        vm.assume(account != alice && account != bob && account != carol);
        fundSeptember();
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = guess;
        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(SEPTEMBER, account, amount, proof);
    }
}
