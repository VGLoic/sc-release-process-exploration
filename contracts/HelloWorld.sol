// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract Counter {
    uint256 public counter;

    function increment() public {
        counter += 1;
    }
}
