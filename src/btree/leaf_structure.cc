#include "btree/leaf_structure.hpp"

const block_magic_t leaf_node_t::expected_magic = { { 'r', 'd', 'b', 'l' } };

const block_magic_t main_leaf_node_t::expected_magic = { { 'l', 'e', 'a', '2' } };
