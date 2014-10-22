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



}  // namespace leaf

