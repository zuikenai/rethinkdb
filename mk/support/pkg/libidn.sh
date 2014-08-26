
version=1.28

src_url=http://ftp.gnu.org/gnu/libidn/libidn-$version.tar.gz

pkg_link-flags () {
    local lib="$install_dir/lib/lib$(lc $1).a"
    if [[ ! -e "$lib" ]]; then
        echo "pkg.sh: error: static library was not built: $lib" >&2
        exit 1
    fi
    echo "-liconv $lib"
}
