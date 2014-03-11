// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef BOOST_UTILS_HPP_
#define BOOST_UTILS_HPP_

#include "errors.hpp"
#include <boost/optional.hpp>
#include <boost/variant.hpp>

#include "containers/printf_buffer.hpp"

template <class T>
void debug_print(printf_buffer_t *buf, const boost::optional<T> &value) {
    if (value) {
        buf->appendf("opt{");
        debug_print(buf, *value);
        buf->appendf("}");
    } else {
        buf->appendf("none");
    }
}

template <class U, class ... Ts>
struct variant_contains;

template <class U, class T, class ... Ts>
struct variant_contains<U, T, Ts ...> {
    static const bool value = variant_contains<U, Ts ...>::value;
};

template <class U, class ... Ts>
struct variant_contains<U, U, Ts ...> {
    static const bool value = true;
};

template <class U>
struct variant_contains<U> {
    static const bool value = false;
};

template <class U, class ... T>
U &checked_boost_get(boost::variant<T ...> &v) {
    static_assert(variant_contains<U, T ...>::value, "Variant does not contain the given type");
    return checked_boost_get<U>(v);
}

template <class U, class ... T>
const U &checked_boost_get(const boost::variant<T ...> &v) {
    static_assert(variant_contains<U, T ...>::value, "Variant does not contain the given type");
    return checked_boost_get<U>(v);
}

template <class U, class ... T>
U *checked_boost_get(boost::variant<T ...> *v) {
    static_assert(variant_contains<U, T ...>::value, "Variant does not contain the given type");
    return checked_boost_get<U>(v);
}

template <class U, class ... T>
const U *checked_boost_get(const boost::variant<T ...> *v) {
    static_assert(variant_contains<U, T ...>::value, "Variant does not contain the given type");
    return checked_boost_get<U>(v);
}

#endif  // BOOST_UTILS_HPP_
