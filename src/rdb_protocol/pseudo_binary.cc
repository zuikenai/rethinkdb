// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "rdb_protocol/pseudo_binary.hpp"

#include "utils.hpp"

namespace ql {
namespace pseudo {

const char *const binary_string = "BINARY";
const char *const data_key = "data";

void rcheck_binary_valid(const datum_t *bin) {
    bool seen_data = false;
    for (const auto &it : bin->as_object()) {
        if (it.first == datum_t::reql_type_string) {
            r_sanity_check(it.second->as_str() == binary_string);
        } else if (it.first == data_key) {
            seen_data = true;
        } else {
            rfail_target(bin, base_exc_t::GENERIC,
                         "Invalid binary pseudotype with illegal key `%s`.",
                         it.first.c_str());
        }
    }
    if (!seen_data) {
        rfail_target(bin, base_exc_t::GENERIC,
                     "Invalid binary pseudotype lacking key `%s`.",
                     data_key);
    }
}

} // namespace pseudo
} // namespace ql
