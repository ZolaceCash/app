// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ZolaceVault} from "../src/ZolaceVault.sol";

// A plain token that stands in for the reward.
contract RewardToken is ERC20 {
    constructor() ERC20("Reward", "RWD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
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

    address signer;
    uint256 signerKey;
    uint256 otherKey;

    // The vault begins on the stroke of an hour, so the hours below are whole.
    uint64 constant FIRST_HOUR = 489_600;
    uint256 constant BEGIN = uint256(FIRST_HOUR) * 1 hours;
    // What one lot earns in an hour, and how many lots there can be: three, so the numbers stay small.
    uint256 constant RATE = 1e15;
    uint256 constant LOTS = 3;

    event SignerSet(address indexed signer);
    event RateSet(uint256 rate, uint256 ceiling);
    event Claimed(address indexed account, uint256 amount, uint256 earned);

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("signer");
        (, otherKey) = makeAddrAndKey("someone else");
        vm.warp(BEGIN);
        reward = new RewardToken();
        vault = new ZolaceVault(owner, reward, LOTS, signer, RATE);
        // The vault is funded by a plain transfer to its address.
        reward.mint(address(vault), 1_000e18);
    }

    // ---- a three-line list, built the way the site builds one: lines hashed, then pairs hashed
    // in sorted order, an odd one carried up as it is.

    function pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    struct List {
        uint64 hour;
        bytes32 root;
        bytes signature;
        bytes32 a;
        bytes32 b;
        bytes32 c;
    }

    function sign(uint256 key, ZolaceVault where, uint64 hour, bytes32 root) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, where.listHash(hour, root));
        return abi.encodePacked(r, s, v);
    }

    // What alice, bob and carol have earned by the end of `hour`, signed by the signer.
    function listOf(uint64 hour, uint256 forAlice, uint256 forBob, uint256 forCarol) internal view returns (List memory list) {
        list.hour = hour;
        list.a = vault.leafOf(alice, forAlice);
        list.b = vault.leafOf(bob, forBob);
        list.c = vault.leafOf(carol, forCarol);
        list.root = pair(pair(list.a, list.b), list.c);
        list.signature = sign(signerKey, vault, hour, list.root);
    }

    function proofFor(List memory list, address account) internal view returns (bytes32[] memory proof) {
        if (account == carol) {
            proof = new bytes32[](1);
            proof[0] = pair(list.a, list.b);
            return proof;
        }
        proof = new bytes32[](2);
        proof[0] = account == alice ? list.b : list.a;
        proof[1] = list.c;
    }

    function claimFrom(List memory list, address account, uint256 earned) internal {
        vault.claim(account, earned, list.hour, list.root, list.signature, proofFor(list, account));
    }

    // The end of the hour that is `hours_` after the first: when a list for it can be claimed from.
    function afterHours(uint256 hours_) internal {
        vm.warp(BEGIN + hours_ * 1 hours);
    }

    // ---- deployment

    function test_DeploymentKeepsTheRewardTheOwnerTheLotsTheSignerAndTheRate() public {
        vm.expectEmit();
        emit SignerSet(signer);
        vm.expectEmit();
        emit RateSet(RATE, 0);
        ZolaceVault made = new ZolaceVault(owner, reward, LOTS, signer, RATE);

        assertEq(address(made.reward()), address(reward));
        assertEq(made.owner(), owner);
        assertEq(made.signer(), signer);
        assertEq(made.rate(), RATE);
        assertEq(made.lots(), LOTS);
        assertEq(made.ceiling(), 0);
        assertEq(made.totalClaimed(), 0);
    }

    function test_DeploymentRefusesNoReward() public {
        vm.expectRevert(ZolaceVault.RewardIsZero.selector);
        new ZolaceVault(owner, IERC20(address(0)), LOTS, signer, RATE);
    }

    // ---- the ceiling

    function test_TheCeilingRisesByTheRateEachHour() public {
        assertEq(vault.ceiling(), 0);
        afterHours(1);
        assertEq(vault.ceiling(), RATE);
        vm.warp(BEGIN + 2 hours + 30 minutes);
        assertEq(vault.ceiling(), (RATE * 5) / 2);
        afterHours(24);
        assertEq(vault.ceiling(), RATE * 24);
    }

    function test_ChangingTheRateKeepsWhatTheCeilingHadReached() public {
        afterHours(2);
        vm.expectEmit(address(vault));
        emit RateSet(RATE * 3, RATE * 2);
        vm.prank(owner);
        vault.setRate(RATE * 3);
        assertEq(vault.ceiling(), RATE * 2);

        afterHours(3);
        assertEq(vault.ceiling(), RATE * 5);

        // A rate of nothing stops the ceiling where it is.
        vm.prank(owner);
        vault.setRate(0);
        afterHours(40);
        assertEq(vault.ceiling(), RATE * 5);
    }

    function test_OnlyTheOwnerSetsTheRateAndTheSigner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        vault.setRate(1);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, signer));
        vm.prank(signer);
        vault.setSigner(stranger);

        vm.expectEmit(address(vault));
        emit SignerSet(stranger);
        vm.prank(owner);
        vault.setSigner(stranger);
        assertEq(vault.signer(), stranger);
    }

    // ---- claiming

    function test_AWalletTakesWhatItHasEarned() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR + 1, RATE * 2, RATE * 2, RATE);
        bytes32[] memory proof = proofFor(list, alice);

        vm.expectEmit(address(vault));
        emit Claimed(alice, RATE * 2, RATE * 2);
        vm.prank(alice);
        vault.claim(alice, RATE * 2, list.hour, list.root, list.signature, proof);

        assertEq(reward.balanceOf(alice), RATE * 2);
        assertEq(vault.claimed(alice), RATE * 2);
        assertEq(vault.totalClaimed(), RATE * 2);
    }

    function test_ALaterListPaysOnlyWhatWasNotTakenYet() public {
        afterHours(1);
        claimFrom(listOf(FIRST_HOUR, RATE, RATE, 0), alice, RATE);

        afterHours(5);
        List memory later = listOf(FIRST_HOUR + 4, RATE * 5, RATE * 4, RATE * 2);
        claimFrom(later, alice, RATE * 5);
        claimFrom(later, bob, RATE * 4);
        claimFrom(later, carol, RATE * 2);

        assertEq(reward.balanceOf(alice), RATE * 5);
        assertEq(reward.balanceOf(bob), RATE * 4);
        assertEq(reward.balanceOf(carol), RATE * 2);
        assertEq(vault.totalClaimed(), RATE * 11);
        assertEq(reward.balanceOf(address(vault)), 1_000e18 - RATE * 11);
    }

    function test_TheSameEarningsAreNotPaidTwice() public {
        afterHours(1);
        List memory first = listOf(FIRST_HOUR, RATE, RATE, RATE);
        claimFrom(first, alice, RATE);

        bytes32[] memory again = proofFor(first, alice);
        vm.expectRevert(ZolaceVault.NothingToClaim.selector);
        vault.claim(alice, RATE, first.hour, first.root, first.signature, again);

        // An older list, used after a newer one, has nothing left in it either.
        afterHours(3);
        claimFrom(listOf(FIRST_HOUR + 2, RATE * 3, RATE, RATE), alice, RATE * 3);
        vm.expectRevert(ZolaceVault.NothingToClaim.selector);
        vault.claim(alice, RATE, first.hour, first.root, first.signature, again);
        assertEq(reward.balanceOf(alice), RATE * 3);
    }

    function test_AnyoneCanSendAClaimButTheRewardGoesToTheListedWallet() public {
        afterHours(1);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        bytes32[] memory proof = proofFor(list, bob);
        vm.prank(stranger);
        vault.claim(bob, RATE, list.hour, list.root, list.signature, proof);
        assertEq(reward.balanceOf(bob), RATE);
        assertEq(reward.balanceOf(stranger), 0);
    }

    function test_AListNobodySignedIsRefused() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        bytes32[] memory proof = proofFor(list, alice);

        // Signed by another key.
        bytes memory forged = sign(otherKey, vault, list.hour, list.root);
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(alice, RATE, list.hour, list.root, forged, proof);

        // The signer's signature, but for another hour.
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(alice, RATE, list.hour + 1, list.root, list.signature, proof);

        // The signer's signature, but for another root: a list that pays alice everything.
        bytes32 greedy = vault.leafOf(alice, RATE * 2);
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(alice, RATE * 2, list.hour, greedy, list.signature, new bytes32[](0));

        assertEq(reward.balanceOf(alice), 0);
    }

    function test_AnotherAmountAnotherWalletOrAnotherProofIsRefused() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE / 2);
        bytes32[] memory forAlice = proofFor(list, alice);
        bytes32[] memory forCarol = proofFor(list, carol);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(alice, RATE + 1, list.hour, list.root, list.signature, forAlice);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(stranger, RATE, list.hour, list.root, list.signature, forAlice);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(alice, RATE, list.hour, list.root, list.signature, forCarol);

        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(carol, RATE, list.hour, list.root, list.signature, forCarol);
    }

    function test_AWalletWithSeveralLotsEarnsSeveralTimesTheRate() public {
        afterHours(3);
        // Alice held two lots through three hours, Bob one.
        List memory list = listOf(FIRST_HOUR + 2, RATE * 6, RATE * 3, 0);
        claimFrom(list, alice, RATE * 6);
        claimFrom(list, bob, RATE * 3);
        assertEq(reward.balanceOf(alice), RATE * 6);
        assertEq(reward.balanceOf(bob), RATE * 3);
    }

    function test_AllWalletsTogetherAreNeverPaidMoreThanTheCeilingWhateverTheSignerSigns() public {
        afterHours(3);
        // Three lots for three hours is nine times the rate, and that is all the vault will pay.
        // The signer's key signs a list that gives Alice one unit more than that.
        List memory greedy = listOf(FIRST_HOUR + 2, RATE * 9 + 1, RATE, RATE);
        bytes32[] memory proof = proofFor(greedy, alice);
        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.OverTheCeiling.selector, RATE * 9 + 1, RATE * 9));
        vault.claim(alice, RATE * 9 + 1, greedy.hour, greedy.root, greedy.signature, proof);
        assertEq(reward.balanceOf(alice), 0);
        assertEq(vault.claimed(alice), 0);

        // Spread over several wallets it is the same: the claim that would pass the limit is refused.
        List memory spread = listOf(FIRST_HOUR + 2, RATE * 4, RATE * 4, RATE + 1);
        claimFrom(spread, alice, RATE * 4);
        claimFrom(spread, bob, RATE * 4);
        bytes32[] memory carols = proofFor(spread, carol);
        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.OverTheCeiling.selector, RATE * 9 + 1, RATE * 9));
        vault.claim(carol, RATE + 1, spread.hour, spread.root, spread.signature, carols);

        // Exactly the ceiling is the most that passes.
        claimFrom(listOf(FIRST_HOUR + 2, RATE * 4, RATE * 4, RATE), carol, RATE);
        assertEq(vault.totalClaimed(), RATE * 9);
    }

    function test_AListForAnHourThatIsNotOverIsRefused() public {
        vm.warp(BEGIN + 1 hours + 59 minutes);
        List memory list = listOf(FIRST_HOUR + 1, RATE, RATE, RATE);
        bytes32[] memory proof = proofFor(list, alice);
        vm.expectRevert(abi.encodeWithSelector(ZolaceVault.HourNotOver.selector, FIRST_HOUR + 1));
        vault.claim(alice, RATE, list.hour, list.root, list.signature, proof);

        afterHours(2);
        vault.claim(alice, RATE, list.hour, list.root, list.signature, proof);
        assertEq(reward.balanceOf(alice), RATE);
    }

    function test_ANewSignerEndsEveryListTheOldOneSigned() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        claimFrom(list, alice, RATE);

        (address next, uint256 nextKey) = makeAddrAndKey("next signer");
        vm.prank(owner);
        vault.setSigner(next);

        bytes32[] memory proof = proofFor(list, bob);
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(bob, RATE, list.hour, list.root, list.signature, proof);

        // The same list, signed by the new signer, pays again.
        vault.claim(bob, RATE, list.hour, list.root, sign(nextKey, vault, list.hour, list.root), proof);
        assertEq(reward.balanceOf(bob), RATE);
    }

    function test_WithNoSignerNothingCanBeClaimed() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        bytes32[] memory proof = proofFor(list, alice);
        vm.prank(owner);
        vault.setSigner(address(0));
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(alice, RATE, list.hour, list.root, list.signature, proof);
    }

    function test_ASignatureIsGoodForOneVaultOnOneChainOnly() public {
        afterHours(2);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        bytes32[] memory proof = proofFor(list, alice);

        // Another vault with the same signer and the same reward.
        vm.warp(BEGIN);
        ZolaceVault twin = new ZolaceVault(owner, reward, LOTS, signer, RATE);
        reward.mint(address(twin), 1_000e18);
        afterHours(2);
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        twin.claim(alice, RATE, list.hour, list.root, list.signature, proof);

        // The same vault's address on another chain.
        vm.chainId(46630);
        vm.expectRevert(ZolaceVault.NotSigned.selector);
        vault.claim(alice, RATE, list.hour, list.root, list.signature, proof);
        assertEq(reward.balanceOf(alice), 0);
    }

    function test_AListThatPromisesMoreThanTheVaultHoldsPaysNothingUntilItIsFunded() public {
        vm.warp(BEGIN);
        ZolaceVault empty = new ZolaceVault(owner, reward, LOTS, signer, RATE);
        reward.mint(address(empty), RATE);
        afterHours(2);

        bytes32 root = empty.leafOf(alice, RATE * 2);
        bytes memory signature = sign(signerKey, empty, FIRST_HOUR + 1, root);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(empty), RATE, RATE * 2)
        );
        empty.claim(alice, RATE * 2, FIRST_HOUR + 1, root, signature, new bytes32[](0));
        assertEq(empty.claimed(alice), 0);

        reward.mint(address(empty), RATE);
        empty.claim(alice, RATE * 2, FIRST_HOUR + 1, root, signature, new bytes32[](0));
        assertEq(reward.balanceOf(alice), RATE * 2);
        assertEq(reward.balanceOf(address(empty)), 0);
    }

    function test_AListOfOneWalletNeedsNoProof() public {
        afterHours(1);
        bytes32 root = vault.leafOf(alice, RATE);
        vault.claim(alice, RATE, FIRST_HOUR, root, sign(signerKey, vault, FIRST_HOUR, root), new bytes32[](0));
        assertEq(reward.balanceOf(alice), RATE);
    }

    function test_GivingUpOwnershipFreezesTheRateAndTheSignerAndLeavesClaimsOpen() public {
        vm.prank(owner);
        vault.renounceOwnership();

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vm.prank(owner);
        vault.setRate(0);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        vm.prank(owner);
        vault.setSigner(stranger);

        afterHours(1);
        claimFrom(listOf(FIRST_HOUR, RATE, RATE, RATE), carol, RATE);
        assertEq(reward.balanceOf(carol), RATE);
    }

    // The numbers below were worked out by the site's own code (lib/vault.ts) for this list, this
    // vault's address, this chain and this signer's key, and tests/vault.test.ts holds the site to
    // them. A claim then passes with the root, the proof and the signature the site made.
    bytes32 constant SITE_LEAF = 0x9b1e997aacb3216e82ea54212108e777af7ca8ad247b24c6af287453c3c3854d;
    bytes32 constant SITE_ROOT = 0xd596b951e59d04ddd6be920058c016b13b7779daac1646608c5350d57c1c0f90;
    bytes32 constant SITE_DIGEST = 0xeb1f4f8a1ec092003b9eb8294fe5ee4f1b5cc7492340802894358082ee05ccd5;
    bytes constant SITE_SIGNATURE =
        hex"358eb8c60b5a23145a422ef84f5b428e6908aa8aa679577220b51038a66ef17f5cdc10ce8e56f454dee088d1494143de0ff8a35570d4dc210c775179832475271c";
    address constant SITE_SIGNER = 0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7;

    // The vault the site signed for: at this address, on Robinhood Chain.
    function vaultTheSiteSignedFor() internal returns (ZolaceVault there) {
        vm.chainId(4663);
        there = ZolaceVault(address(0xf1));
        vm.etch(address(there), abi.encodePacked(type(ZolaceVault).creationCode, abi.encode(owner, reward, LOTS, SITE_SIGNER, RATE)));
        (bool made, bytes memory code) = address(there).call("");
        assertTrue(made);
        vm.etch(address(there), code);
        reward.mint(address(there), 1_000);
    }

    function test_TheSiteAndTheContractHashAndSignAListTheSameWay() public {
        ZolaceVault there = vaultTheSiteSignedFor();
        bytes32 a = there.leafOf(address(0xa1), 500);
        bytes32 b = there.leafOf(address(0xb2), 300);
        bytes32 c = there.leafOf(address(0xc3), 150);
        assertEq(a, SITE_LEAF);
        assertEq(pair(pair(a, b), c), SITE_ROOT);
        assertEq(there.listHash(FIRST_HOUR, SITE_ROOT), SITE_DIGEST);

        afterHours(1);
        bytes32[] memory forSecond = new bytes32[](2);
        forSecond[0] = a;
        forSecond[1] = c;
        there.claim(address(0xb2), 300, FIRST_HOUR, SITE_ROOT, SITE_SIGNATURE, forSecond);
        bytes32[] memory forThird = new bytes32[](1);
        forThird[0] = pair(a, b);
        there.claim(address(0xc3), 150, FIRST_HOUR, SITE_ROOT, SITE_SIGNATURE, forThird);
        assertEq(reward.balanceOf(address(0xb2)), 300);
        assertEq(reward.balanceOf(address(0xc3)), 150);
    }

    // ---- for any amounts

    function testFuzz_ATwoLineListPaysExactlyWhatItSays(uint96 first, uint96 second) public {
        afterHours(1_000);
        uint256 a = bound(uint256(first), 1, RATE * 1_000);
        uint256 b = bound(uint256(second), 1, RATE * 1_000);
        bytes32 lineA = vault.leafOf(alice, a);
        bytes32 lineB = vault.leafOf(bob, b);
        bytes32 root = pair(lineA, lineB);
        bytes memory signature = sign(signerKey, vault, FIRST_HOUR + 999, root);

        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = lineB;
        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = lineA;

        vault.claim(alice, a, FIRST_HOUR + 999, root, signature, proofA);
        vault.claim(bob, b, FIRST_HOUR + 999, root, signature, proofB);

        assertEq(reward.balanceOf(alice), a);
        assertEq(reward.balanceOf(bob), b);
        assertEq(vault.totalClaimed(), a + b);
        assertEq(reward.balanceOf(address(vault)), 1_000e18 - a - b);
    }

    function testFuzz_NobodyOffTheListGetsAnything(address account, uint256 amount, bytes32 guess) public {
        vm.assume(account != alice && account != bob && account != carol);
        afterHours(1);
        List memory list = listOf(FIRST_HOUR, RATE, RATE, RATE);
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = guess;
        vm.expectRevert(ZolaceVault.NotOnTheList.selector);
        vault.claim(account, amount, list.hour, list.root, list.signature, proof);
    }

    // Whatever the signer signs and whenever it is claimed, a wallet ends up with what the list
    // says or with nothing, and the vault never pays out more than the ceiling of that moment.
    function testFuzz_TheVaultNeverPaysMoreThanTheCeiling(uint32 wait, uint256 earned) public {
        uint256 waited = bound(uint256(wait), 1 hours, 2_000 hours);
        earned = bound(earned, 1, RATE * LOTS * 4_000);
        vm.warp(BEGIN + waited);
        uint64 hour = uint64((BEGIN + waited) / 1 hours) - 1;

        bytes32 root = vault.leafOf(alice, earned);
        bytes memory signature = sign(signerKey, vault, hour, root);
        uint256 limit = vault.ceiling() * LOTS;

        if (earned > limit) {
            vm.expectRevert(abi.encodeWithSelector(ZolaceVault.OverTheCeiling.selector, earned, limit));
            vault.claim(alice, earned, hour, root, signature, new bytes32[](0));
            assertEq(reward.balanceOf(alice), 0);
        } else {
            vault.claim(alice, earned, hour, root, signature, new bytes32[](0));
            assertEq(reward.balanceOf(alice), earned);
        }
        assertLe(vault.totalClaimed(), limit);
    }
}
