/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Las imágenes de evidencia van a vivir en Supabase Storage.
  // El dominio se agrega aquí cuando exista el proyecto.
  images: { remotePatterns: [] },
};

export default nextConfig;
