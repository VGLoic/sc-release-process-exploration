// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IncrementOracle} from "./IncrementOracle.sol";

contract Counter {
    uint256 public counter;

    string constant a = "LOL";

    function increment() public {
        uint256 incrementAmount = IncrementOracle.getIncrement();
        counter += incrementAmount * 3;
    }
}
