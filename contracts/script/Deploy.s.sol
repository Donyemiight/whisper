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
        address deployer = vm.addr(pk);
        bytes32 teeMeasurement = vm.envBytes32("TEE_IMAGE_MEASUREMENT");
        if (teeMeasurement == bytes32(0)) {
            teeMeasurement = keccak256("whisper-tee-image-v1");
        }

        // Use startBroadcast(deployer) so constructor msg.sender == deployer.
        vm.startBroadcast(deployer);

        // 1) MockFXRP — owner is deployer
        MockFXRP fxrp = new MockFXRP(deployer);
        console2.log("MockFXRP deployed at:", address(fxrp));

        // 2) WhisperVTPMVerifier — owner is deployer
        WhisperVTPMVerifier tee = new WhisperVTPMVerifier(teeMeasurement, deployer);
        console2.log("WhisperVTPMVerifier deployed at:", address(tee));

        // 3) WhisperVault — owner is deployer, settle is set to msg.sender
        //    placeholder that we overwrite via setSettle() after WhisperSettle is deployed.
        //    To avoid the constructor's ZeroAddress() check, we temporarily pass
        //    deployer here and set the real settle below.
        WhisperVault vault = new WhisperVault(
            address(fxrp),
            address(0x1),  // dummy non-zero address to pass the ZeroAddress check
            address(tee),
            teeMeasurement,
            deployer
        );
        console2.log("WhisperVault deployed at:", address(vault));

        // 4) WhisperSettle — owner is deployer, vault is set after
        WhisperSettle settle = new WhisperSettle(address(vault), deployer);
        console2.log("WhisperSettle deployed at:", address(settle));

        // 5) Wire settle into vault (replace the dummy)
        vault.setSettle(address(settle));

        // 6) Register the demo TEE identity
        bytes32 teeId = bytes32(0x2222222222222222222222222222222222222222222222222222222222222222);
        address demoTee = 0x131E4A54aB221929834815c99195dAec316aC270;
        tee.registerTEE(teeId, demoTee, teeMeasurement);
        console2.log("Registered TEE:", demoTee);

        // 7) Mint some mFXRP to the deployer for testing
        fxrp.mint(deployer, 1_000_000 * 1e6);
        console2.log("Minted 1M mFXRP to deployer");

        vm.stopBroadcast();

        // 8) Write deployment addresses
        string memory json = string.concat(
            "{\n",
            '  "fxrp": "', vm.toString(address(fxrp)), '",\n',
            '  "teeVerifier": "', vm.toString(address(tee)), '",\n',
            '  "vault": "', vm.toString(address(vault)), '",\n',
            '  "settle": "', vm.toString(address(settle)), '",\n',
            '  "teeMeasurement": "', vm.toString(teeMeasurement), '",\n',
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "network": "coston2",\n',
            '  "chainId": 114,\n',
            '  "rpc": "https://coston2-api.flare.network/ext/C/rpc",\n',
            '  "explorer": "https://coston2-explorer.flare.network"\n',
            "}"
        );
        vm.writeFile("./deployments.json", json);
        console2.log("Deployment saved to ./deployments.json");
        console2.log("---");
        console2.log(json);
    }
}
