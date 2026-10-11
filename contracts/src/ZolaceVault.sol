// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title Zolace vault
/// @notice Holds the reward that holders of the Zolace token claim. Each hour a list says what
/// every wallet has earned since the vault began; a wallet takes what it has earned and not yet
/// taken, with a proof that it is on a list the signer signed.
/// @dev The list is worked out off the chain, from the token's public transfers, and published,
/// so anyone can check it (CONTRACT.md). Nothing is sent to this contract when a list is made:
/// the signer only signs its root, and the signature travels with the claim.
///
/// A wallet earns by the lot: so many tokens held through an hour is one lot, twice as many is
/// two. The rate is what one lot earns in an hour at the most.
///
/// What this contract makes sure of is narrow, and it is not that a list is right. It makes sure
/// that a wallet is never paid twice for the same earnings, and that all wallets together are
/// never paid more than the ceiling allows: the rate per hour, added up over the hours the vault
/// has run, for as many lots as the token's whole supply can make. Whoever holds the signer's key
/// or the owner's key decides who is on a list, so within that ceiling they decide where the
/// reward in this contract goes. Nobody can take it out any other way: there is no function that
/// withdraws.
contract ZolaceVault is Ownable2Step, EIP712 {
    using SafeERC20 for IERC20;

    /// @notice The token the reward is paid in.
    IERC20 public immutable reward;

    /// @notice How many lots the token's whole supply can make at the most. All wallets together
    /// can never have earned more than this many times the ceiling.
    uint256 public immutable lots;

    /// @notice The key whose signature makes a list count. The zero address stops all claims.
    address public signer;

    /// @notice The most one lot can earn in an hour, in the reward's smallest units.
    uint256 public rate;

    /// @notice What the ceiling had reached when the rate was last set, and when that was.
    uint256 public ceilingStored;
    uint64 public ceilingSince;

    /// @notice What a wallet has taken so far, of everything it has earned.
    mapping(address account => uint256 taken) public claimed;

    /// @notice What all wallets have taken so far.
    uint256 public totalClaimed;

    bytes32 public constant LIST_TYPEHASH = keccak256("List(uint64 hour,bytes32 root)");

    event SignerSet(address indexed signer);
    event RateSet(uint256 rate, uint256 ceiling);
    event Claimed(address indexed account, uint256 amount, uint256 earned);

    error RewardIsZero();
    error HourNotOver(uint64 hour);
    error NotSigned();
    error NotOnTheList();
    error OverTheCeiling(uint256 taken, uint256 limit);
    error NothingToClaim();

    constructor(address initialOwner, IERC20 rewardToken, uint256 mostLots, address initialSigner, uint256 initialRate)
        Ownable(initialOwner)
        EIP712("Zolace Vault", "1")
    {
        if (address(rewardToken) == address(0)) revert RewardIsZero();
        reward = rewardToken;
        lots = mostLots;
        signer = initialSigner;
        rate = initialRate;
        ceilingSince = uint64(block.timestamp);
        emit SignerSet(initialSigner);
        emit RateSet(initialRate, 0);
    }

    /// @notice The most one lot can have earned by now: the rate, added up over every hour since
    /// the vault began. It only ever grows.
    function ceiling() public view returns (uint256) {
        return ceilingStored + (rate * (block.timestamp - ceilingSince)) / 1 hours;
    }

    /// @notice Changes the rate from now on. What the ceiling reached under the old rate is kept.
    function setRate(uint256 newRate) external onlyOwner {
        ceilingStored = ceiling();
        ceilingSince = uint64(block.timestamp);
        rate = newRate;
        emit RateSet(newRate, ceilingStored);
    }

    /// @notice Names another signer. Every list the old one signed stops counting at once.
    function setSigner(address newSigner) external onlyOwner {
        signer = newSigner;
        emit SignerSet(newSigner);
    }

    /// @notice Pays `account` what it has earned and not yet taken. Anyone may send this for any
    /// account: the reward only ever goes to the account on the list, never to the caller.
    /// @param earned Everything the account has earned since the vault began, as the list has it.
    /// @param hour The hour the list runs to, counted in hours since 1970. It has to be over.
    /// @param root The root of that list.
    /// @param signature The signer's signature over the hour and the root.
    /// @param proof The hashes that tie this account and amount to the root.
    function claim(
        address account,
        uint256 earned,
        uint64 hour,
        bytes32 root,
        bytes calldata signature,
        bytes32[] calldata proof
    ) external {
        if ((uint256(hour) + 1) * 1 hours > block.timestamp) revert HourNotOver(hour);
        if (signer == address(0) || ECDSA.recoverCalldata(listHash(hour, root), signature) != signer) revert NotSigned();
        if (!MerkleProof.verifyCalldata(proof, root, leafOf(account, earned))) revert NotOnTheList();

        uint256 taken = claimed[account];
        if (earned <= taken) revert NothingToClaim();
        uint256 amount = earned - taken;
        claimed[account] = earned;
        totalClaimed += amount;

        // Whatever the signer signed, the vault as a whole never pays out faster than every lot
        // there can be, earning the full rate in every hour.
        uint256 limit = ceiling() * lots;
        if (totalClaimed > limit) revert OverTheCeiling(totalClaimed, limit);

        reward.safeTransfer(account, amount);
        emit Claimed(account, amount, earned);
    }

    /// @notice What the signer signs for a list: its hour and its root, bound to this contract on
    /// this chain, so a signature is good nowhere else.
    function listHash(uint64 hour, bytes32 root) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIST_TYPEHASH, hour, root)));
    }

    /// @notice One line of a list, as it is hashed into the root. Hashed twice, so a line can
    /// never be mistaken for a pair of hashes inside the tree.
    function leafOf(address account, uint256 earned) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, earned))));
    }
}
