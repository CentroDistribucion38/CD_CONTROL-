/**
 * Las dos tipografías de la pantalla de acceso se piden solo aquí, no en
 * el resto de la app. Se cargan con <link> (no con next/font) para que la
 * compilación no dependa de que Google responda.
 */
export default function LoginLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
      />
      {children}
    </>
  );
}
