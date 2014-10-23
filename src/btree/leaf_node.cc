#include "btree/leaf_node.hpp"

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"
#include "buffer_cache/alt.hpp"

namespace leaf {

using main_leaf_t = new_leaf_t<main_btree_t>;

inline bool is_old(const leaf_node_t *node) {
    return node->magic == leaf_node_t::expected_magic;
}

inline bool is_old(sized_ptr_t<const leaf_node_t> node) {
    return is_old(node.buf);
}

inline bool is_new(const leaf_node_t *node) {
    return node->magic == main_leaf_node_t::expected_magic;
}

inline bool is_new(sized_ptr_t<const leaf_node_t> node) {
    return is_new(node.buf);
}

inline const main_leaf_node_t *as_new(const leaf_node_t *node) {
    rassert(is_new(node));
    return reinterpret_cast<const main_leaf_node_t *>(node);
}

inline sized_ptr_t<const main_leaf_node_t> as_new(sized_ptr_t<const leaf_node_t> node) {
    rassert(is_new(node));
    return sized_reinterpret_cast<const main_leaf_node_t>(node);
}

inline sized_ptr_t<main_leaf_node_t> as_new(sized_ptr_t<leaf_node_t> node) {
    rassert(is_new(node));
    return sized_reinterpret_cast<main_leaf_node_t>(node);
}

void convert_to_new_leaf_if_necessary(value_sizer_t *sizer, buf_write_t *buf) {
    sized_ptr_t<leaf_node_t> node = buf->get_sized_data_write<leaf_node_t>();
    if (is_new(node)) {
        return;
    }
    rassert(is_old(node));
    rassert(node.block_size == sizer->default_block_size().value());

    const leaf::state_description_t desc
        = old_leaf::full_state_description(sizer, node.buf, buf->get_recency());

    buf_ptr_t buf_ptr = main_leaf_t::reconstruct(sizer->default_block_size(), desc);
    buf->set_data_write(std::move(buf_ptr));
}


void validate(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node) {
    if (is_old(node)) {
        old_leaf::validate(sizer, node.buf);
    } else {
        main_leaf_t::validate(sizer->default_block_size(), as_new(node));
    }
}

bool is_empty(sized_ptr_t<const leaf_node_t> node) {
    if (is_old(node)) {
        return old_leaf::is_empty(node.buf);
    } else {
        return main_leaf_t::is_empty(as_new(node));
    }
}

bool is_full(value_sizer_t *sizer, const leaf_node_t *node,
             const btree_key_t *key, const void *value) {
    if (is_old(node)) {
        return old_leaf::is_full(sizer, node, key, value);
    } else {
        default_block_size_t bs = sizer->default_block_size();
        return main_leaf_t::is_full(
                bs,
                as_new(node),
                main_btree_t::live_entry_size_from_keyvalue(bs, key, value));
    }
}

bool is_underfull(value_sizer_t *sizer, const leaf_node_t *node) {
    if (is_old(node)) {
        return old_leaf::is_underfull(sizer, node);
    } else {
        return main_leaf_t::is_underfull(sizer->default_block_size(), as_new(node));
    }
}

void split(value_sizer_t *sizer,
           buf_write_t *node,
           buf_ptr_t *rnode_out,
           store_key_t *median_out) {
    convert_to_new_leaf_if_necessary(sizer, node);
    main_leaf_t::split(sizer->default_block_size(), node, rnode_out, median_out);
}

void merge(value_sizer_t *sizer,
           buf_write_t *left,
           buf_write_t *right) {
    convert_to_new_leaf_if_necessary(sizer, left);
    convert_to_new_leaf_if_necessary(sizer, right);
    main_leaf_t::merge(sizer->default_block_size(), left, right);
}

// RSI: I guess the specific is_mergable implementations are dead.
bool is_mergable(value_sizer_t *sizer,
                 const leaf_node_t *node,
                 const leaf_node_t *sibling) {
    return is_underfull(sizer, node) && is_underfull(sizer, sibling);
}

bool level(value_sizer_t *sizer, int nodecmp_node_with_sib,
           buf_write_t *node, buf_write_t *sib,
           store_key_t *replacement_key_out,
           std::vector<scoped_malloc_t<void> > *moved_live_values_out) {
    convert_to_new_leaf_if_necessary(sizer, node);
    convert_to_new_leaf_if_necessary(sizer, sib);
    std::vector<scoped_malloc_t<void> > entries;
    bool leveled = main_leaf_t::level(sizer->default_block_size(), nodecmp_node_with_sib,
                                      node, sib, replacement_key_out, &entries);

    // RSI: Maybe we should just have new_leaf output the values, not entries.
    for (scoped_malloc_t<void> &entry : entries) {
        const void *value = main_btree_t::live_entry_value(static_cast<const main_btree_t::entry_t *>(entry.get()));
        scoped_malloc_t<void> v(main_btree_t::value_size(sizer->default_block_size(),
                                                         value));
        entry = std::move(v);
    }
    *moved_live_values_out = std::move(entries);

    return leveled;
}

bool lookup(value_sizer_t *sizer, sized_ptr_t<const leaf_node_t> node,
            const btree_key_t *key, void *value_out) {
    if (is_old(node.buf)) {
        rassert(node.block_size == sizer->default_block_size().value());
        return old_leaf::lookup(sizer, node.buf, key, value_out);
    } else {
        const void *entry;
        bool found = main_leaf_t::lookup_entry(as_new(node), key, &entry);
        if (found) {
            const auto e = static_cast<const main_btree_t::entry_t *>(entry);
            if (main_btree_t::is_live(e)) {
                const void *value = main_btree_t::live_entry_value(e);
                memcpy(value_out, value,
                       main_btree_t::value_size(sizer->default_block_size(), value));
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }
}

void insert(value_sizer_t *sizer, buf_write_t *node, const btree_key_t *key,
            const void *value, repli_timestamp_t tstamp) {
    convert_to_new_leaf_if_necessary(sizer, node);
    default_block_size_t bs = sizer->default_block_size();
    scoped_malloc_t<main_btree_t::entry_t> entry
        = main_btree_t::combine_live_entry(bs, tstamp, key, value);
    main_leaf_t::insert_entry(bs, node, entry.get());
}

void remove(value_sizer_t *sizer, buf_write_t *node, const btree_key_t *key,
            repli_timestamp_t tstamp) {
    convert_to_new_leaf_if_necessary(sizer, node);
    default_block_size_t bs = sizer->default_block_size();

    // We want to remove our live entry... and insert a dead one.
    // RSI:  erase_presence could thus wastefully compactify the node.
    main_leaf_t::erase_presence(bs, node, key);
    scoped_malloc_t<void> dead_entry = main_btree_t::combine_dead_entry(tstamp, key);
    main_leaf_t::insert_entry(bs, node, dead_entry.get());
}

void erase_presence(value_sizer_t *sizer, buf_write_t *node, const btree_key_t *key) {
    convert_to_new_leaf_if_necessary(sizer, node);
    main_leaf_t::erase_presence(sizer->default_block_size(), node, key);
}



}  // namespace leaf

