// Project-relative glob matching shared by the steering runtime, the verification gate, the selection resolver and
// the verification-scope detector: `**` crosses directories, `*` and `?` stay inside one segment.

/** The anchored regular expression for one glob. */
export function globRegex(glob) {
  let source = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      // `dir/**/x` also matches `dir/x`.
      if (glob[i + 2] === "/") { source += "(?:.*/)?"; i += 2; } else { source += ".*"; i += 1; }
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

/** Whether `path` matches any of `patterns`. */
export function matches(path, patterns) {
  return (patterns ?? []).some((pattern) => globRegex(pattern).test(path));
}
