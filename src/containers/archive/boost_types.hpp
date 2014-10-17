// Copyright 2010-2012 RethinkDB, all rights reserved.
#ifndef CONTAINERS_ARCHIVE_BOOST_TYPES_HPP_
#define CONTAINERS_ARCHIVE_BOOST_TYPES_HPP_

#include "errors.hpp"
#include <boost/make_shared.hpp>
#include <boost/optional.hpp>
#include <boost/variant.hpp>

#include "containers/archive/archive.hpp"
#include "containers/archive/varint.hpp"

template <cluster_version_t W>
NORETURN void serialize(UNUSED write_message_t *wm,
                        UNUSED const boost::detail::variant::void_ &v) {
    unreachable("You cannot do serialize(write_message_t *, boost::detail::variant::void_ &).");
}

template <cluster_version_t W>
MUST_USE archive_result_t deserialize(UNUSED read_stream_t *s,
                                      UNUSED boost::detail::variant::void_ *v) {
    unreachable("You cannot do deserialize(read_stream_t *, boost::detail::variant::void_ *).");
}

template <cluster_version_t W, int N, class... Ts>
struct variant_serializer_t;

template <cluster_version_t W, int N, class T, class... Ts>
struct variant_serializer_t<W, N, T, Ts...> : public variant_serializer_t<W, N + 1, Ts...> {

    using variant_serializer_t<W, N + 1, Ts...>::operator();
    using variant_serializer_t<W, N + 1, Ts...>::variant_serializer_t;
    using variant_serializer_t<W, N + 1, Ts...>::wm;

    void operator() (const T &x) {
        uint8_t n = N;
        serialize<W>(wm, n);
        serialize<W>(wm, x);
    }
};

template <cluster_version_t W, int N>
struct variant_serializer_t<W, N> {
private:
    struct end_of_variant { };

public:
    variant_serializer_t (const write_message_t *wm_) : wm(wm_) { }

    void operator() (const end_of_variant&){
        unreachable();
    }

    static const uint8_t size = N;
    const write_message_t *wm;

};

template <cluster_version_t W, class... Ts>
void serialize(write_message_t *wm, const boost::variant<Ts...> &x) {
    variant_serializer_t<W, Ts...> visitor(wm);
    rassert(sizeof(visitor) == sizeof(write_message_t *));

    boost::apply_visitor(visitor, x);
}

template <cluster_version_t W, int N, class Variant, class... Ts>
class variant_deserializer;

template <cluster_version_t W, int N, class Variant, class T, class... Ts>
class variant_deserializer<W, N, Variant, T, Ts...> {
    MUST_USE archive_result_t operator() (int n, read_stream_t *s, Variant *x) {
        if (n == N) {
            T v;
            archive_result_t res = deserialize<W>(s, &v);
            if (bad(res)) { return res; }
            *x = v;

            return archive_result_t::SUCCESS;
        } else {
            return variant_deserializer<W, N + 1, Variant, Ts...>(n, s, x);
        }
    }
};

template <cluster_version_t W, int N, class Variant>
class variant_deserializer<W, N, Variant> {
    MUST_USE archive_result_t operator() (int, read_stream_t *, Variant *) {
        return archive_result_t::RANGE_ERROR;
    }
};

template <cluster_version_t W, class... Ts>
MUST_USE archive_result_t deserialize(read_stream_t *s, boost::variant<Ts...> *x) {
    uint8_t n;
    archive_result_t res = deserialize<W>(s, &n);
    if (bad(res)) { return res; }

    return variant_deserializer<W, 1, boost::variant<Ts...>, Ts...>(n, s, x);
}


template <cluster_version_t W, class T>
void serialize(write_message_t *wm, const boost::optional<T> &x) {
    const T *ptr = x.get_ptr();
    bool exists = ptr;
    serialize<W>(wm, exists);
    if (exists) {
        serialize<W>(wm, *ptr);
    }
}


template <cluster_version_t W, class T>
MUST_USE archive_result_t deserialize(read_stream_t *s, boost::optional<T> *x) {
    bool exists;

    archive_result_t res = deserialize<W>(s, &exists);
    if (bad(res)) { return res; }
    if (exists) {
        x->reset(T());
        res = deserialize<W>(s, x->get_ptr());
        return res;
    } else {
        x->reset();
        return archive_result_t::SUCCESS;
    }
}

#endif  // CONTAINERS_ARCHIVE_BOOST_TYPES_HPP_
