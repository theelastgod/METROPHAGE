// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Fixed-supply $METRO for Robinhood Chain. All tokens minted to deployer; no further mint.
contract MetroToken {
  string public name;
  string public symbol;
  uint8 public immutable decimals;
  uint256 public totalSupply;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  event Transfer(address indexed from, address indexed to, uint256 value);
  event Approval(address indexed owner, address indexed spender, uint256 value);

  constructor(string memory n, string memory s, uint8 d, uint256 supply) {
    name = n;
    symbol = s;
    decimals = d;
    totalSupply = supply;
    balanceOf[msg.sender] = supply;
    emit Transfer(address(0), msg.sender, supply);
  }

  function transfer(address to, uint256 v) external returns (bool) {
    require(balanceOf[msg.sender] >= v, "bal");
    unchecked {
      balanceOf[msg.sender] -= v;
      balanceOf[to] += v;
    }
    emit Transfer(msg.sender, to, v);
    return true;
  }

  function approve(address s, uint256 v) external returns (bool) {
    allowance[msg.sender][s] = v;
    emit Approval(msg.sender, s, v);
    return true;
  }

  function transferFrom(address f, address t, uint256 v) external returns (bool) {
    require(balanceOf[f] >= v, "bal");
    uint256 a = allowance[f][msg.sender];
    require(a >= v, "allow");
    if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
    unchecked {
      balanceOf[f] -= v;
      balanceOf[t] += v;
    }
    emit Transfer(f, t, v);
    return true;
  }
}
