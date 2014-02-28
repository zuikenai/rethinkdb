// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_TREE_VALIDATION_HPP_
#define BTREE_TREE_VALIDATION_HPP_

#include "errors.hpp"
#include "btree/node.hpp"
#include "buffer_cache/types.hpp"

class superblock_t;
class signal_t;

void validate_btree(superblock_t *superblock);

#endif  // BTREE_TREE_VALIDATION_HPP_
