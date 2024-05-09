// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

contract Bar {
    uint256 public bar;

    function increment() public {
        bar += 2;
    }
}
