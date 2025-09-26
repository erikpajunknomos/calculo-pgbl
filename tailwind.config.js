/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        nomos: {
          ink: "#021e19",    // verde escuro
          lime: "#c8e05b",   // verde lima
          paper: "#f4ece6",  // off-white
          gray: "#a6a797"    // cinza
        },
      },
      borderRadius: {
        "2xl": "1rem"
      }
    },
  },
  plugins: [],
};
