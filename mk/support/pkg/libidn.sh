
version=1.28

src_url=http://ftp.gnu.org/gnu/libidn/libidn-$version.tar.gz

pkg_link-flags () {
    local flags
    flags=$install_dir/lib/libidn.a
    if [[ "$OS" = "Darwin" ]]; then
        flags="$flags -liconv"
    fi
    echo "$flags"
}
