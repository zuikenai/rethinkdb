// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BTREE_NEW_LEAF_HPP_
#define BTREE_NEW_LEAF_HPP_

#include <vector>

#include "errors.hpp"
#include <boost/optional.hpp>

#include "containers/sized_ptr.hpp"
#include "errors.hpp"
#include "serializer/types.hpp"

struct btree_key_t;
class buf_write_t;
class buf_ptr_t;
class entry_reception_callback_t;
struct main_leaf_node_t;
struct store_key_t;

namespace new_leaf {

enum class dump_result_t {
    exact_live_and_dead_entries,
    all_live_entries,
};

template <class btree_type>
class new_leaf_t {
public:
    static buf_ptr_t init();

    static MUST_USE bool find_key(sized_ptr_t<const main_leaf_node_t> node,
                                  const btree_key_t *key,
                                  int *index_out);

    static void insert_entry(default_block_size_t bs,
                             buf_write_t *buf,
                             const void *entry);

    static void erase_presence(default_block_size_t bs,
                               buf_write_t *buf,
                               const btree_key_t *key);

    static MUST_USE bool lookup_entry(sized_ptr_t<const main_leaf_node_t> node,
                                      const btree_key_t *key,
                                      const void **entry_ptr_out);

    static bool is_empty(sized_ptr_t<const main_leaf_node_t> node);

    static bool is_full(default_block_size_t bs, const main_leaf_node_t *node,
                        const void *entry);

    static bool is_underfull(default_block_size_t bs, const main_leaf_node_t *node);

    static void split(default_block_size_t bs,
                      buf_write_t *node,
                      buf_ptr_t *rnode_out,
                      store_key_t *median_out);

    static void level(default_block_size_t bs, int nodecmp_node_with_sib,
                      buf_write_t *node, buf_write_t *sib,
                      store_key_t *replacement_key_out,
                      std::vector<scoped_malloc_t<void> > *moved_live_entries_out);

    static void merge(default_block_size_t bs,
                      buf_write_t *left, buf_write_t *right);

    static bool is_mergable(default_block_size_t bs,
                            const main_leaf_node_t *node,
                            const main_leaf_node_t *sibling);

    static
    dump_result_t
    dump_entries_since_time(default_block_size_t bs,
                            sized_ptr_t<const main_leaf_node_t> node,
                            repli_timestamp_t minimum_tstamp,
                            repli_timestamp_t maximum_possible_timestamp,
                            std::vector<const void *> *entries_out);

#ifndef NDEBUG
    static void validate(default_block_size_t bs, sized_ptr_t<const main_leaf_node_t> node);
#else
    static void validate(default_block_size_t, sized_ptr_t<const main_leaf_node_t>) { }
#endif
};

}  // namespace new_leaf

using new_leaf::new_leaf_t;

#endif /* BTREE_NEW_LEAF_HPP_ */
