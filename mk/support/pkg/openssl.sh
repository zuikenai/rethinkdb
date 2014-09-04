
version=1.0.1i

src_url="https://www.openssl.org/source/openssl-$version.tar.gz"


pkg_configure () {
    in_dir "$build_dir" ./config --prefix="$(niceabspath "$install_dir")"
}

pkg_install-include () {
    pkg_copy_src_to_build
    pkg_configure
    pkg_make 
}

pkg_install () {
    pkg_copy_src_to_build
    pkg_configure
    pkg_make
    pkg_make install
}
