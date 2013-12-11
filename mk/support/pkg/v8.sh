
version=3.19.18.4

src_git_repo=git://github.com/v8/v8

pkg_fetch () {
    pkg_make_tmp_fetch_dir
    git_clone_tag "$src_git_repo" "${src_git_ref:-$version}" "$tmp_dir"
    make -C "$tmp_dir" dependencies
    pkg_move_tmp_to_src
}

pkg_install () {
    pkg_copy_src_to_build
    mkdir -p "$install_dir/lib"

    CXX="g++"
    DISABLE_WARNINGS="array-bounds unused-local-typedefs aggressive-loop-optimizations unused-result"
    for flag in $DISABLE_WARNINGS; do
        if $CXX -Werror -W$flag -E - >/dev/null 2>&1 </dev/null ; then
            CXXFLAGS="${CXXFLAGS:-} -Wno-$flag"
        fi
    done
    echo CXXFLAGS: $CXXFLAGS
    pkg_make native CXXFLAGS="$CXXFLAGS" CXX="$CXX"
    find "$build_dir" -iname "*.o" | grep -v '\/preparser_lib\/' | xargs ar cqs "$install_dir/lib/libv8.a"
}
