// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {Terreno} from "../src/Terreno.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * The upgrade, against the real deployed proxy on Base.
 *
 * Every other test in this repo runs against a contract this suite deployed
 * itself, with storage it laid out. That proves the code is self-consistent; it
 * cannot prove the upgrade is safe against the state that actually exists on
 * mainnet — 5,622 land pixels, real owners, a halving clock that started in
 * production. Those are the bytes an upgrade can corrupt, and the only way to
 * know is to run it against them.
 *
 * Skipped unless BASE_FORK_RPC_URL is set, so CI without an archive node stays
 * green rather than failing for an absent secret:
 *
 *   BASE_FORK_RPC_URL=https://mainnet.base.org forge test --match-contract Fork -vv
 */
contract TerrenoUpgradeForkTest is Test {
    address constant PROXY = 0x8db1EaAd99eF3a4c2AE4479D0570C00E12Be3f79;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    Terreno terreno = Terreno(PROXY);
    bool forked;

    function setUp() public {
        string memory url = vm.envOr("BASE_FORK_RPC_URL", string(""));
        if (bytes(url).length == 0) return;
        vm.createSelectFork(url);
        forked = true;
    }

    /// Marks the test SKIPPED rather than letting it report PASS having
    /// asserted nothing. A green run must never imply the upgrade was checked
    /// against mainnet when no fork was available to check it against.
    function _requireFork() internal {
        vm.skip(!forked);
    }

    /// Deploy the new implementation and upgrade, as the real owner would.
    function _upgrade() internal {
        (uint16 w, uint16 h, uint256 halving,,,,) = terreno.config();
        Terreno impl = new Terreno(w, h, halving);
        address owner = terreno.owner();
        vm.prank(owner);
        terreno.upgradeToAndCall(address(impl), "");
    }

    function test_fork_upgradePreservesLiveState() public {
        _requireFork();

        (uint16 w0, uint16 h0, uint256 halving0, uint256 initial0, uint256 min0, uint256 start0, uint256 fee0)
        = terreno.config();
        address owner0 = terreno.owner();
        // A pixel with a real owner and a real sale history on mainnet.
        (address pxOwner0, uint8 pxSales0) = terreno.pixels(6708);

        _upgrade();

        (uint16 w1, uint16 h1, uint256 halving1, uint256 initial1, uint256 min1, uint256 start1, uint256 fee1)
        = terreno.config();
        assertEq(w1, w0);
        assertEq(h1, h0);
        assertEq(halving1, halving0);
        assertEq(initial1, initial0, "initialPrice must survive - it prices the whole map");
        assertEq(min1, min0);
        assertEq(start1, start0, "the halving clock must not restart");
        assertEq(fee1, fee0);
        assertEq(terreno.owner(), owner0);

        (address pxOwner1, uint8 pxSales1) = terreno.pixels(6708);
        assertEq(pxOwner1, pxOwner0, "a live holder must still own their land");
        assertEq(pxSales1, pxSales0, "sale history drives price; it must survive");
    }

    function test_fork_newFunctionIsLiveAndGuardStartsClean() public {
        _requireFork();
        _upgrade();
        assertFalse(terreno.settledNimTx(keccak256("anything")));
    }

    /// The whole point: a NIM-funded purchase lands in the PLAYER's wallet,
    /// settled by a relayer, against real mainnet state.
    function test_fork_settleNimPurchaseAssignsLandToThePlayer() public {
        _requireFork();
        _upgrade();

        address player = makeAddr("player");
        address settler = makeAddr("settler");
        bytes32 nimTx = keccak256("nimiq-funding-tx");

        // Find an unowned land pixel so the buy is a primary sale.
        uint256 id = _findUnownedLandPixel();
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        uint256 price = terreno.selectionPrice(ids);
        deal(USDC, settler, price * 2);
        vm.startPrank(settler);
        IERC20(USDC).approve(PROXY, type(uint256).max);
        terreno.settleNimPurchase(nimTx, player, ids, USDC, price, block.timestamp + 300);
        vm.stopPrank();

        (address owner,) = terreno.pixels(id);
        assertEq(owner, player, "the player owns the land, not the settler");
        assertTrue(terreno.settledNimTx(nimTx), "the funding tx is consumed");

        // And it cannot be settled a second time.
        deal(USDC, settler, price * 2);
        vm.prank(settler);
        vm.expectRevert(abi.encodeWithSelector(Terreno.NimTxAlreadySettled.selector, nimTx));
        terreno.settleNimPurchase(nimTx, player, ids, USDC, price * 2, block.timestamp + 300);
    }

    /// Scan for a land pixel nobody holds yet.
    function _findUnownedLandPixel() internal view returns (uint256) {
        for (uint16 y = 0; y < 100; ++y) {
            for (uint16 x = 0; x < 170; ++x) {
                if (!terreno.isLand(x, y)) continue;
                uint256 id = terreno.pixelId(x, y);
                (address o,) = terreno.pixels(id);
                if (o == address(0)) return id;
            }
        }
        revert("no unowned land pixel found");
    }
}
