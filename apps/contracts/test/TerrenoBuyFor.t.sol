// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Terreno} from "../src/Terreno.sol";
import {MockUSDT} from "./mocks/MockUSDT.sol";

/**
 * `buyPixelsFor` — buying on somebody else's behalf.
 *
 * The reason it exists: a payment settled in another currency (NIM, on a chain
 * that cannot reach this contract) has to be finished by a relayer on Base. If
 * the relayer is `msg.sender` then the relayer owns the land and the
 * `PixelsPurchased` event names the relayer, which is what every leaderboard
 * indexes. The player would pay and get nothing on the board.
 *
 * The property under test throughout: the RECIPIENT receives the pixels and is
 * named in the event, while the CALLER pays. Anything that lets a caller move a
 * third party's pixels, or spend a third party's tokens, is a defect.
 */
contract TerrenoBuyForTest is Test {
    Terreno public terreno;
    MockUSDT public usdt;

    address public alice = address(0xA11CE); // the player
    address public relayer = address(0xBEEF); // settles on their behalf
    address public mallory = address(0xBAD); // uninvolved third party

    uint256 public constant INITIAL_PRICE = 100_000; // 0.10 USDT
    uint256 public constant MIN_PRICE = 1;
    uint256 public constant FEE_RATE = 500; // 5%
    uint256 public constant HALVING_TIME = 14 days;

    event PixelsPurchased(
        address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost
    );
    event PixelsPurchasedFor(
        address indexed payer, address indexed recipient, uint256[] ids, uint256 totalCost
    );
    event NimPurchaseSettled(
        bytes32 indexed nimTxHash, address indexed recipient, uint256[] ids, uint256 totalCost
    );

    function setUp() public {
        usdt = new MockUSDT();

        uint256[] memory mask = new uint256[](235);
        mask[0] = type(uint256).max;
        mask[1] = type(uint256).max;

        address[] memory tokens = new address[](1);
        tokens[0] = address(usdt);
        Terreno impl = new Terreno(300, 200, HALVING_TIME);
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(Terreno.initialize, (tokens, INITIAL_PRICE, MIN_PRICE, FEE_RATE, mask))
        );
        terreno = Terreno(address(proxy));

        address[3] memory users = [alice, relayer, mallory];
        for (uint256 i; i < users.length; ++i) {
            usdt.mint(users[i], 1_000_000e6);
            vm.prank(users[i]);
            usdt.approve(address(terreno), type(uint256).max);
        }
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory out) {
        out = new uint256[](1);
        out[0] = a;
    }

    // ========== The core split: recipient owns, caller pays ==========

    function test_buyPixelsFor_assignsPixelsToRecipient() public {
        vm.prank(relayer);
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        (address owner,) = terreno.pixels(5);
        assertEq(owner, alice, "recipient must own the pixel");
    }

    function test_buyPixelsFor_chargesTheCallerNotTheRecipient() public {
        uint256 relayerBefore = usdt.balanceOf(relayer);
        uint256 aliceBefore = usdt.balanceOf(alice);

        vm.prank(relayer);
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        assertLt(usdt.balanceOf(relayer), relayerBefore, "caller pays");
        assertEq(usdt.balanceOf(alice), aliceBefore, "recipient is not charged");
    }

    /// The attribution that drives every leaderboard: the event must name the
    /// player, never the address that funded it.
    function test_buyPixelsFor_eventNamesTheRecipientAsBuyer() public {
        vm.expectEmit(true, true, false, true);
        emit PixelsPurchased(alice, address(usdt), _ids(5), INITIAL_PRICE);

        vm.prank(relayer);
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);
    }

    function test_buyPixelsFor_emitsTheAuditTrail() public {
        vm.expectEmit(true, true, false, true);
        emit PixelsPurchasedFor(relayer, alice, _ids(5), INITIAL_PRICE);

        vm.prank(relayer);
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);
    }

    /// Control for the test above: the ordinary path must not emit it, or every
    /// normal buy would carry a settlement record that never happened.
    function test_buyPixelsFor_selfRecipientEmitsNoAuditTrail() public {
        vm.recordLogs();
        vm.prank(alice);
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("PixelsPurchasedFor(address,address,uint256[],uint256)");
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != sig, "no audit event when payer == recipient");
        }
    }

    // ========== The ordinary path is unchanged ==========

    function test_buyPixels_stillAssignsToTheCaller() public {
        vm.prank(alice);
        terreno.buyPixels(_ids(5), address(usdt), type(uint256).max, type(uint256).max);

        (address owner,) = terreno.pixels(5);
        assertEq(owner, alice);
    }

    // ========== Resale: the previous owner is still paid ==========

    function test_buyPixelsFor_paysThePreviousOwner() public {
        vm.prank(alice);
        terreno.buyPixels(_ids(5), address(usdt), type(uint256).max, type(uint256).max);

        uint256 aliceBefore = usdt.balanceOf(alice);
        uint256 price = terreno.priceOf(5, 0);

        // Relayer settles a NIM-funded purchase for mallory.
        vm.prank(relayer);
        terreno.buyPixelsFor(mallory, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        (address owner,) = terreno.pixels(5);
        assertEq(owner, mallory, "recipient takes ownership");

        uint256 expected = price - (price * FEE_RATE) / 10_000;
        assertEq(usdt.balanceOf(alice) - aliceBefore, expected, "previous owner keeps price minus fee");
    }

    // ========== What it must NOT allow ==========

    function test_buyPixelsFor_cannotSpendAThirdPartysTokens() public {
        uint256 malloryBefore = usdt.balanceOf(mallory);

        // Relayer names mallory as recipient — mallory's balance must be untouched.
        vm.prank(relayer);
        terreno.buyPixelsFor(mallory, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        assertEq(usdt.balanceOf(mallory), malloryBefore, "a third party never funds someone else's call");
    }

    function test_buyPixelsFor_revertsOnZeroRecipient() public {
        vm.prank(relayer);
        vm.expectRevert(Terreno.InvalidRecipient.selector);
        terreno.buyPixelsFor(
            address(0), _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );
    }

    function test_buyPixelsFor_revertsWhenTheCallerCannotPay() public {
        address broke = address(0xDEAD11);
        vm.prank(broke);
        usdt.approve(address(terreno), type(uint256).max);

        vm.prank(broke);
        vm.expectRevert();
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max);

        (address owner,) = terreno.pixels(5);
        assertEq(owner, address(0), "a failed payment assigns nothing");
    }

    // ========== Guards still apply on the new path ==========

    function test_buyPixelsFor_enforcesSlippage() public {
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(Terreno.SlippageExceeded.selector, INITIAL_PRICE, INITIAL_PRICE - 1)
        );
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), INITIAL_PRICE - 1, type(uint256).max);
    }

    function test_buyPixelsFor_enforcesDeadline() public {
        uint256 past = block.timestamp - 1;
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Terreno.DeadlineExpired.selector, past));
        terreno.buyPixelsFor(alice, _ids(5), address(usdt), type(uint256).max, past);
    }

    function test_buyPixelsFor_rejectsUnacceptedToken() public {
        MockUSDT other = new MockUSDT();
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Terreno.TokenNotAccepted.selector, address(other)));
        terreno.buyPixelsFor(alice, _ids(5), address(other), type(uint256).max, type(uint256).max);
    }

    // ========== NIM settlement: the one-shot guard ==========

    bytes32 constant NIM_TX = keccak256("nimiq-tx-1");

    function test_settleNimPurchase_assignsToRecipientAndMarksTheTxSettled() public {
        vm.prank(relayer);
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );

        (address owner,) = terreno.pixels(5);
        assertEq(owner, alice, "player owns the land they paid NIM for");
        assertTrue(terreno.settledNimTx(NIM_TX), "the funding tx is consumed");
    }

    /// The guarantee this function exists for: one NIM payment buys land once,
    /// whoever retries and however many settler instances are running.
    function test_settleNimPurchase_cannotSettleTheSameNimTxTwice() public {
        vm.prank(relayer);
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(Terreno.NimTxAlreadySettled.selector, NIM_TX));
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(6), address(usdt), type(uint256).max, type(uint256).max
        );
    }

    /// Control for the test above: a DIFFERENT payment must still settle, or the
    /// guard would be indistinguishable from the function simply being broken.
    function test_settleNimPurchase_allowsADifferentNimTx() public {
        vm.prank(relayer);
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );

        vm.prank(relayer);
        terreno.settleNimPurchase(
            keccak256("nimiq-tx-2"), alice, _ids(6), address(usdt), type(uint256).max, type(uint256).max
        );

        (address owner,) = terreno.pixels(6);
        assertEq(owner, alice);
    }

    /// A settlement that reverts must leave the hash unconsumed, or a transient
    /// failure would burn the player's payment permanently.
    function test_settleNimPurchase_failedSettlementLeavesTheTxRetryable() public {
        vm.prank(relayer);
        vm.expectRevert();
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), INITIAL_PRICE - 1, type(uint256).max
        );

        assertFalse(terreno.settledNimTx(NIM_TX), "a reverted settlement is retryable");

        vm.prank(relayer);
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );
        (address owner,) = terreno.pixels(5);
        assertEq(owner, alice);
    }

    function test_settleNimPurchase_rejectsZeroHash() public {
        vm.prank(relayer);
        vm.expectRevert(Terreno.InvalidNimTxHash.selector);
        terreno.settleNimPurchase(
            bytes32(0), alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );
    }

    function test_settleNimPurchase_rejectsZeroRecipient() public {
        vm.prank(relayer);
        vm.expectRevert(Terreno.InvalidRecipient.selector);
        terreno.settleNimPurchase(
            NIM_TX, address(0), _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );
    }

    function test_settleNimPurchase_emitsTheNimTxHashForAudit() public {
        vm.expectEmit(true, true, false, true);
        emit NimPurchaseSettled(NIM_TX, alice, _ids(5), INITIAL_PRICE);

        vm.prank(relayer);
        terreno.settleNimPurchase(
            NIM_TX, alice, _ids(5), address(usdt), type(uint256).max, type(uint256).max
        );
    }

    function test_buyPixelsFor_rejectsWaterPixels() public {
        // Pixel 5000 is outside the two land words set in setUp().
        vm.prank(relayer);
        vm.expectRevert();
        terreno.buyPixelsFor(alice, _ids(5000), address(usdt), type(uint256).max, type(uint256).max);
    }
}
