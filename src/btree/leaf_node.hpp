// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_LEAF_NODE_HPP_
#define BTREE_LEAF_NODE_HPP_

#include "btree/old_leaf.hpp"
#include "containers/sized_ptr.hpp"
#include "repli_timestamp.hpp"

class buf_write_t;

namespace leaf {

// A complete description of an old_leaf node's state.  Used for constructing a
// new_leaf.  (The old leaf must not be modified!)
struct state_description_t {
    // The timestamp for which we aren't missing any deletion entries >= that
    // timestamp.  (Maybe distant_past when we have 0 entries.)
    repli_timestamp_t partial_replicability_age;

    struct entry_ptrs_t {
        repli_timestamp_t tstamp;
        const btree_key_t *key;
        // Deletion entries don't have values and have a NULL pointer instead.
        const void *value_or_null;
    };

    // All the node's entries, with timestamp and pointers into the leaf node for key
    // and (if applicable) value.  Deletion entries don't have values and have a NULL
    // pointer instead.
    // These are sorted by key!
    std::vector<entry_ptrs_t> entries;
};


using ::old_leaf::begin;
using ::old_leaf::end;
using ::old_leaf::rbegin;
using ::old_leaf::rend;

using ::old_leaf::inclusive_lower_bound;
using ::old_leaf::inclusive_upper_bound;


void validate(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node);

bool is_empty(sized_ptr_t<const leaf_node_t> node);

bool is_full(value_sizer_t *sizer, const leaf_node_t *node,
             const btree_key_t *key, const void *value);

bool is_underfull(value_sizer_t *sizer, const leaf_node_t *node);

void split(value_sizer_t *sizer,
           buf_write_t *node,
           buf_ptr_t *rnode_out,
           store_key_t *median_out);

// RSI: Remove assertions in merge and level and such about stuff being underfull or
// not -- leaf::is_mergable will run old_leaf underfull code.  Make those functions
// be super-rigorous about avoiding empty nodes, gracefully failing.
void merge(value_sizer_t *sizer,
           buf_write_t *left,
           buf_write_t *right);

bool is_mergable(value_sizer_t *sizer, const leaf_node_t *node, const leaf_node_t *sibling);

MUST_USE bool level(value_sizer_t *sizer, int nodecmp_node_with_sib,
                    buf_write_t *node, buf_write_t *sib,
                    store_key_t *replacement_key_out,
                    std::vector<scoped_malloc_t<void> > *moved_live_values_out);

MUST_USE bool lookup(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node,
                     const btree_key_t *key, void *value_out);


using ::old_leaf::init;
using ::old_leaf::insert;
using ::old_leaf::remove;
using ::old_leaf::erase_presence;
using ::old_leaf::dump_entries_since_time;
using ::old_leaf::entry_reception_callback_t;

using ::old_leaf::reverse_iterator;


}  // namespace leaf


#endif  // BTREE_LEAF_NODE_HPP_
