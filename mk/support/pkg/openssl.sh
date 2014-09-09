
version=1.0.1i

src_url="https://www.openssl.org/source/openssl-$version.tar.gz"


pkg_configure () {
    in_dir "$build_dir" ./config no-shared --prefix="$(niceabspath "$install_dir")"
}

pkg_install () {
    pkg_copy_src_to_build

    pkg_configure

    # Compiling without -j1 causes a lot of "undefined reference" errors
    pkg_make -j1

    pkg_make install
}
