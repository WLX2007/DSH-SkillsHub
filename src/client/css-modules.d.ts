/**
 * CSS Modules type declaration: importing `x.module.css` yields the hashed
 * class map (compiled by lightningcss inside the client bundle).
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
