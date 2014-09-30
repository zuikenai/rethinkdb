// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_LEAF_STRUCTURE_HPP_
#define BTREE_LEAF_STRUCTURE_HPP_

#include <stdint.h>

#include "buffer_cache/types.hpp"
#include "repli_timestamp.hpp"

// The leaf node begins with the following struct layout.  (This is the old leaf node
// layout, which is getting migrated to main_leaf_node_t or something else, depending
// on which btree it's in.)
struct leaf_node_t {
    // The magic value: It tells us whether this is in the original format (described
    // here) or some other.
    block_magic_t magic;

    // The size of pair_offsets.
    uint16_t num_pairs;

    // The total size (in bytes) of the live entries and their 2-byte
    // pair offsets in pair_offsets.  (Does not include the size of
    // the live entries' timestamps.)
    uint16_t live_size;

    // The frontmost offset.
    uint16_t frontmost;

    // The first offset whose entry is not accompanied by a timestamp.
    uint16_t tstamp_cutpoint;

    // The pair offsets.
    uint16_t pair_offsets[];

    static const block_magic_t expected_magic;

} __attribute__ ((__packed__));


// Leaf nodes for the main b-tree.
struct main_leaf_node_t {
    // The magic value, telling that it's of the main_leaf_node_t struct layout, and
    // not some other.
    block_magic_t magic;

    // The size of pair_offsets;
    uint16_t num_pairs;

    // The total size of "live" entries, including their 2-byte pair offsets in
    // pair_offsets.  Accounts for the size of metadata such as entries' timestamps.
    uint16_t live_entry_size;

    // The total size of "dead" entries, including their 2-byte pair offsets in
    // pair_offsets.  Accounts for the size of metadata.
    uint16_t dead_entry_size;

    // The frontmost offset.  This is just the minimum value in pair_offsets, or
    // perhaps less than the minimum value (if the first entry was removed).  If
    // num_pairs is 0, what might this value be?  Probably something >=
    // offsetof(main_leaf_node_t, pair_offsets).  TODO(2014-09): Update the docs on
    // what frontmost could be when num_pairs == 0.
    uint16_t frontmost;

    // The timestamp for which we aren't missing any "dead" entries >= that
    // timestamp.  (Initialized to distant_past when we have 0 entries.)
    repli_timestamp_t partial_replicability_age;

    // The pair offsets.
    uint16_t pair_offsets[];

    static const block_magic_t expected_magic;

} __attribute__ ((__packed__));



#endif  // BTREE_LEAF_STRUCTURE_HPP_
