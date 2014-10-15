#include "btree/leaf_node.hpp"

#include "btree/leaf_structure.hpp"
#include "btree/main_btree.hpp"
#include "btree/new_leaf.hpp"

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

// RSI: Implement this.
#if 0
void convert_to_new_leaf_if_necessary(buf_write_t *buf) {
    sized_ptr_t<leaf_node_t> node = buf->get_sized_data_write<leaf_node_t>();
    if (is_new(node)) {
        return;
    }
    rassert(is_old(node));
}
#endif  // 0


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


}  // namespace leaf

