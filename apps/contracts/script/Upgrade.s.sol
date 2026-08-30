// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {Terreno} from "../src/Terreno.sol";

/**
 * Upgrade a deployed Terreno proxy to a fresh implementation.
 *
 *   PROXY_ADDRESS=0x8db1... forge script script/Upgrade.s.sol --rpc-url base
 *   PROXY_ADDRESS=0x8db1... forge script script/Upgrade.s.sol --rpc-url base --broadcast
 *
 * Without --broadcast it simulates against live state. The assertions below run
 * in the simulation too, so a dry run that reverts has already told you not to
 * broadcast.
 *
 * The proxy comes from the environment rather than from a local broadcast
 * artifact. Upgrading a contract deployed from another machine is the normal
 * case, and reading `broadcast/Deploy.s.sol/...` silently picks up whatever was
 * last deployed HERE — nothing on a fresh clone, possibly a testnet elsewhere.
 *
 * The signing key is read from the environment inside the script rather than
 * passed as --private-key, so it never appears in argv or shell history.
 *
 * Everything after the upgrade is a check that reverts the whole transaction on
 * failure. A UUPS upgrade that corrupts storage cannot be repaired by another
 * upgrade — the state is already gone — so the only safe moment to catch it is
 * before the transaction is mined.
 */
contract UpgradeScript is Script {
    /**
     * The signing key, accepting it with or without an `0x` prefix.
     *
     * `vm.envUint` requires the prefix and reverts without it, which is a
     * confusing failure for something that looks like a valid key in a file.
     * Read as a string and normalize instead. The value is never logged.
     */
    function _signerKey() internal view returns (uint256) {
        string memory raw = vm.envString("PRIVATE_KEY");
        bytes memory b = bytes(raw);
        if (b.length == 64) return vm.parseUint(string.concat("0x", raw));
        return vm.parseUint(raw);
    }

    function run() external {
        address proxy = vm.envAddress("PROXY_ADDRESS");
        Terreno current = Terreno(proxy);

        // The state that must survive. `initialPrice` is the base of every
        // pixel's price and `halvingStartTimestamp` is the clock they decay
        // against; either moving would silently reprice the entire map.
        (
            uint16 width,
            uint16 height,
            uint256 halvingTime,
            uint256 initialPrice,
            uint256 minPrice,
            uint256 halvingStart,
            uint256 feeRate
        ) = current.config();
        address owner = current.owner();

        console.log("Proxy:               ", proxy);
        console.log("Owner:               ", owner);
        console.log("initialPrice:        ", initialPrice);
        console.log("halvingStart:        ", halvingStart);

        vm.startBroadcast(_signerKey());

        // Same immutables as the live contract: they are constructor args, so a
        // mismatch would change the grid or the halving period under the
        // existing owners of 5,622 land pixels.
        Terreno newImpl = new Terreno(width, height, halvingTime);
        console.log("New implementation:  ", address(newImpl));

        current.upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        // --- Post-upgrade checks. Any failure reverts the whole broadcast. ---
        (
            uint16 w2,
            uint16 h2,
            uint256 halving2,
            uint256 initial2,
            uint256 min2,
            uint256 start2,
            uint256 fee2
        ) = current.config();

        require(w2 == width && h2 == height, "grid changed");
        require(halving2 == halvingTime, "halving period changed");
        require(initial2 == initialPrice, "initialPrice changed - the map would reprice");
        require(min2 == minPrice, "minPrice changed");
        require(start2 == halvingStart, "halving clock moved - every price would shift");
        require(fee2 == feeRate, "feeRate changed");
        require(current.owner() == owner, "owner changed");

        // The function this upgrade exists to add must actually be reachable.
        require(!current.settledNimTx(bytes32(uint256(1))), "settleNimPurchase not reachable");

        console.log("Upgrade verified. State preserved.");
    }
}
