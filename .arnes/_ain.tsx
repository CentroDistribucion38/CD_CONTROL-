import { renderToStaticMarkup } from "react-dom/server";
import Page from "../src/app/(app)/admin/inicio/page";
export const html = async () => renderToStaticMarkup(await Page());