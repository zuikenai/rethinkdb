// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_OLD_LEAF_HPP_
#define BTREE_OLD_LEAF_HPP_

#include <string>
#include <utility>
#include <vector>

#include "buffer_cache/types.hpp"
#include "errors.hpp"
#include "repli_timestamp.hpp"

class value_sizer_t;
struct btree_key_t;
class repli_timestamp_t;
struct store_key_t;

struct leaf_node_t;

namespace leaf {
struct entry_ptrs_t;
struct state_description_t;
}  // namespace leaf

namespace old_leaf {
class iterator;

old_leaf::iterator begin(const leaf_node_t *leaf_node);
old_leaf::iterator end(const leaf_node_t *leaf_node);

old_leaf::iterator inclusive_lower_bound(const btree_key_t *key, const leaf_node_t *leaf_node);
old_leaf::iterator upper_bound(const btree_key_t *key, const leaf_node_t *leaf_node);


// We must maintain timestamps and deletion entries as best we can,
// with the following limitations.  The number of timestamps stored
// need not be more than the most `MANDATORY_TIMESTAMPS` recent
// timestamps.  The deletions stored need not be any more than what is
// necessary to fill `(block_size - offsetof(leaf_node_t,
// pair_offsets)) / DELETION_RESERVE_FRACTION` bytes.  For example,
// with a 4084 block size, if the five most recent operations were
// deletions of 250-byte keys, we would only be required to store the
// 2 most recent deletions and the 2 most recent timestamps.
//
// These parameters are in the header because some unit tests are
// based on them.
const int MANDATORY_TIMESTAMPS = 5;
const int DELETION_RESERVE_FRACTION = 10;






std::string strprint_leaf(value_sizer_t *sizer, const leaf_node_t *node);

void print(FILE *fp, value_sizer_t *sizer, const leaf_node_t *node);

void validate(value_sizer_t *sizer, const leaf_node_t *node);

void init(value_sizer_t *sizer, leaf_node_t *node);

bool is_empty(const leaf_node_t *node);

bool is_full(value_sizer_t *sizer, const leaf_node_t *node, const btree_key_t *key, const void *value);

bool is_underfull(value_sizer_t *sizer, const leaf_node_t *node);

void split(value_sizer_t *sizer, leaf_node_t *node, leaf_node_t *sibling,
           store_key_t *median_out);

void merge(value_sizer_t *sizer, leaf_node_t *left, leaf_node_t *right);

// The pointers in `moved_values_out` point to positions in `node` and
// will be valid as long as `node` remains unchanged.
bool level(value_sizer_t *sizer, int nodecmp_node_with_sib, leaf_node_t *node,
           leaf_node_t *sibling, store_key_t *replacement_key_out,
           std::vector<const void *> *moved_values_out);

bool is_mergable(value_sizer_t *sizer, const leaf_node_t *node, const leaf_node_t *sibling);

bool lookup(value_sizer_t *sizer, const leaf_node_t *node, const btree_key_t *key, void *value_out);

void insert(value_sizer_t *sizer, leaf_node_t *node, const btree_key_t *key, const void *value, repli_timestamp_t tstamp);

void remove(value_sizer_t *sizer, leaf_node_t *node, const btree_key_t *key, repli_timestamp_t tstamp);

void erase_presence(value_sizer_t *sizer, leaf_node_t *node, const btree_key_t *key);

// Returns true if *entries_out is filled with an "exact" set of entries in the leaf
// node that are >= minimum_tstamp.  Otherwise, the leaf node does not have enough
// information about deleted entries, and instead, _all_ the live entries of the leaf
// node are included (and no dead ones are).
bool dump_entries_since_time(value_sizer_t *sizer, const leaf_node_t *node, repli_timestamp_t minimum_tstamp, repli_timestamp_t maximum_possible_timestamp, std::vector<leaf::entry_ptrs_t> *entries_out);

leaf::state_description_t full_state_description(
        value_sizer_t *sizer, const leaf_node_t *node,
        repli_timestamp_t maximum_possible_timestamp);

class iterator {
public:
    iterator();
    iterator(const leaf_node_t *node, int index);
    std::pair<const btree_key_t *, const void *> operator*() const;
    void step();
    void step_backward();
    bool operator==(const iterator &other) const;
    bool operator!=(const iterator &other) const;
private:
    const leaf_node_t *node_;
    int index_;
};

}  // namespace old_leaf


#endif  // BTREE_OLD_LEAF_HPP_
