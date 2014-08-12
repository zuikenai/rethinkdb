#ifndef RDB_PROTOCOL_PAR_LEVEL_HPP_
#define RDB_PROTOCOL_PAR_LEVEL_HPP_

#include "valgrind.hpp"

// The parallelizability of a term.  It's a struct and not an enum class so that you
// can't use std::max or other comparisons.  Also because descriptions of
// parallelizability might become more intricate.
struct par_level_t {
    par_level_t() : value(valgrind_undefined(0)) { }

    static par_level_t NONE() { return par_level_t(0); }
    static par_level_t ONE() { return par_level_t(1); }
    static par_level_t MANY() { return par_level_t(2); }

    bool may_be_parallelized() const { return value == 1; }

private:
    par_level_t(int _value) : value(_value) { }

    friend par_level_t par_join(par_level_t a, par_level_t b);
    int value;
};

// Returns the parallelization level of the combination of two operations run at the
// same time or sequentially.
inline par_level_t par_join(par_level_t a, par_level_t b) {
    return a.value < b.value ? b : a;
}

// The parallelizability of javascript evaluation.  We say that js terms can be
// parallelized, because they're run in an external process and they can probably run
// simultaneously a little bit.
inline par_level_t js_evaluation_par_level() { return par_level_t::ONE(); }

#endif  // RDB_PROTOCOL_PAR_LEVEL_HPP_
