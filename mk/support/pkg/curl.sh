
version=7.36.0

src_url=http://curl.haxx.se/download/curl-$version.tar.bz2

pkg_configure () {
    local prefix
    prefix="$(niceabspath "$install_dir")"
    in_dir "$build_dir" ./configure --prefix="$prefix" --without-gnutls --with-ssl --without-librtmp --disable-ldap --disable-shared
}

pkg_install-include () {
    pkg_copy_src_to_build
    pkg_configure
    make -C "$build_dir/include"  install
}

pkg_install () {
    # pkg_copy_src_to_build
    # pkg_configure
    make -C "$build_dir/lib" install-libLTLIBRARIES
    make -C "$build_dir" install-binSCRIPTS
}

pkg_depends () {
    echo libidn zlib openssl
}

pkg_link-flags () {
    local ret=''
    out () { ret="$ret$@ " ; }
    local flags
    flags="`"$install_dir/bin/curl-config" --static-libs`"
    for flag in $flags; do
        case "$flag" in
            -lz)      out `pkg link-flags zlib z` ;;
            -lidn)    out `pkg link-flags libidn idn` ;;
            -lssl)    out `pkg link-flags openssl ssl` ;;
            -lcrypto) out `pkg link-flags openssl crypto` ;;
            -ldl)     ;;
            -lrt)     out "$flag" ;;
            -l*)      echo "Warning: '$pkg' links with '$flag'" >&2
                      out "$flag" ;;
            *)        out "$flag" ;;
        esac
    done
    echo "$ret" -ldl
}
