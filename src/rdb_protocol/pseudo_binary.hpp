// Copyright 2010-2013 RethinkDB, all rights reserved.
#ifndef RDB_PROTOCOL_PSEUDO_BINARY_HPP_
#define RDB_PROTOCOL_PSEUDO_BINARY_HPP_

#include "rdb_protocol/datum.hpp"

namespace ql {
namespace pseudo {

extern const char *const binary_string;
extern const char *const data_key;

void rcheck_binary_valid(const datum_t *bin);

} // namespace pseudo
} // namespace ql

#endif  // RDB_PROTOCOL_PSEUDO_BINARY_HPP_
