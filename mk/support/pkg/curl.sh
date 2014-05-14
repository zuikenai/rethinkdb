
version=7.36.0

src_url=http://curl.haxx.se/download/curl-$version.tar.bz2

pkg_configure () {
    in_dir "$build_dir" ./configure --prefix="$(niceabspath "$install_dir")" --with-gnutls --without-ssl
}

pkg_install-include () {
    pkg_copy_src_to_build
    pkg_configure
    make -C "$build_dir/include" install
}

pkg_depends () {
    echo libidn zlib gnutls
}
