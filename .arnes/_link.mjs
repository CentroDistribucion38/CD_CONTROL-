import { createElement } from "react";
export default function Link({ href, children, ...r }) { return createElement("a", { href, ...r }, children) }