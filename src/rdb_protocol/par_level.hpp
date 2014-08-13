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

    // This "collapses" to MANY, but if you attach a .get() to it, you can get ONE.
    static par_level_t TABLE() { return par_level_t(3); }

    bool should_be_parallelized() const { return value == 1; }

private:
    par_level_t(int _value) : value(_value) { }

    friend par_level_t par_join(par_level_t a, par_level_t b);
    friend par_level_t par_table_with_params(par_level_t params_level);
    friend par_level_t par_get_on_table(par_level_t table, par_level_t pkey);
    int value;
};

// Returns the parallelization level of the combination of two operations run at the
// same time or sequentially.
inline par_level_t par_join(par_level_t a, par_level_t b) {
    // Collapse "TABLE" parallelization levels to MANY.
    a.value = std::min(a.value, 2);
    b.value = std::min(b.value, 2);
    return a.value < b.value ? b : a;
}

inline par_level_t par_table_with_params(par_level_t params_level) {
    return params_level.value < 2 ? par_level_t::TABLE() : par_level_t::MANY();
}

inline par_level_t par_get_on_table(par_level_t table_level, par_level_t pkey_level) {
    // r.table(x...).get(y...) will have a parallelization level of ONE if (x... is
    // not MANY and y... is not MANY).
    return par_join(table_level.value == 3 ? par_level_t::ONE() : table_level,
                    pkey_level);
}

// The parallelizability of javascript evaluation.  We say that js terms can be
// parallelized, because they're run in an external process and they can probably run
// simultaneously a little bit.
inline par_level_t js_evaluation_par_level() { return par_level_t::ONE(); }

// This is a made-up number.  It would be better if the number was set more
// dynamically.
static const int NUM_PARALLELIZATION_JOBS = 10;

#endif  // RDB_PROTOCOL_PAR_LEVEL_HPP_
