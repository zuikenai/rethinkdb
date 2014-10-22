// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_LEAF_NODE_HPP_
#define BTREE_LEAF_NODE_HPP_

#include "btree/old_leaf.hpp"
#include "containers/sized_ptr.hpp"
#include "repli_timestamp.hpp"

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

using ::old_leaf::init;
using ::old_leaf::is_underfull;
using ::old_leaf::split;
using ::old_leaf::merge;
using ::old_leaf::level;
using ::old_leaf::is_mergable;
using ::old_leaf::lookup;
using ::old_leaf::insert;
using ::old_leaf::remove;
using ::old_leaf::erase_presence;
using ::old_leaf::dump_entries_since_time;
using ::old_leaf::entry_reception_callback_t;

using ::old_leaf::reverse_iterator;


}  // namespace leaf


#endif  // BTREE_LEAF_NODE_HPP_
