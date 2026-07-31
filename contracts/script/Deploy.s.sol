// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {WhisperVault} from "../src/WhisperVault.sol";
import {WhisperSettle} from "../src/WhisperSettle.sol";
import {WhisperVTPMVerifier} from "../src/VTPMVerifier.sol";
import {MockFXRP} from "../src/MockFXRP.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        bytes32 teeMeasurement = vm.envBytes32("TEE_IMAGE_MEASUREMENT");
        if (teeMeasurement == bytes32(0)) {
            teeMeasurement = keccak256("whisper-tee-image-v1");
        }

        vm.startBroadcast(pk);

        // 1. Deploy mock FXRP (on real mainnet, use the canonical FAsset FXRP)
        MockFXRP fxrp = new MockFXRP(msg.sender);
        console2.log("MockFXRP deployed at:", address(fxrp));

        // 2. Deploy TEE verifier
        WhisperVTPMVerifier tee = new WhisperVTPMVerifier(teeMeasurement, msg.sender);
        console2.log("WhisperVTPMVerifier deployed at:", address(tee));

        // 3. Deploy vault
        WhisperVault vault = new WhisperVault(
            address(fxrp),
            address(0x9999), // settle placeholder, set below
            address(tee),
            teeMeasurement,
            msg.sender
        );
        console2.log("WhisperVault deployed at:", address(vault));

        // 4. Deploy settle
        WhisperSettle settle = new WhisperSettle(address(vault), msg.sender);
        console2.log("WhisperSettle deployed at:", address(settle));

        // 5. Wire settle into vault
        vault.setSettle(address(settle));

        vm.stopBroadcast();

        // 6. Save deployment addresses
        string memory json = string.concat(
            "{\n",
            '  "fxrp": "', vm.toString(address(fxrp)), '",\n',
            '  "teeVerifier": "', vm.toString(address(tee)), '",\n',
            '  "vault": "', vm.toString(address(vault)), '",\n',
            '  "settle": "', vm.toString(address(settle)), '",\n',
            '  "teeMeasurement": "', vm.toString(teeMeasurement), '"\n',
            "}"
        );
        vm.writeFile("./deployments.json", json);
        console2.log("Deployment saved to ./deployments.json");
        console2.log("---");
        console2.log(json);
    }
}
