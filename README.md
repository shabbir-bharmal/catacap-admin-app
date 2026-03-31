# CataCap Admin

This is the frontend repository for the CataCap Admin panel, built with React, TypeScript, and Vite. It provides an interface for managing CataCap's operations, including investments, users, requests, and site configurations.

## Features

- **Modern Tech Stack**: Built with React 18, TypeScript, and Vite for fast development and optimal performance.
- **UI Components**: Utilizes a customized component library (likely based on shadcn/ui) with Radix UI primitives.
- **Styling**: Tailwind CSS for utility-first styling with comprehensive configuration.
- **State Management**: React Query (@tanstack/react-query) for efficient server state management.
- **Forms**: React Hook Form with Zod validation.
- **Routing**: Client-side routing with `wouter`.

## Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

- **Node.js**: Ensure you have Node.js installed (v20 or higher recommended).
- **Package Manager**: This project uses [pnpm](https://pnpm.io/). If you don't have it installed, you can enable it with corepack:
  ```bash
  corepack enable
  ```
  Or install it globally:
  ```bash
  npm install -g pnpm
  ```

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

### Running the Development Server

To start the local development server:

```bash
pnpm dev
```

The application will be available at [http://localhost:5000](http://localhost:5000).

### Building for Production

To build the application for production:

```bash
pnpm build
```

The build artifacts will be stored in the `dist/` directory.

To preview the production build locally:

```bash
pnpm preview
```

## Project Structure

- `src/`: contains the source code.
  - `components/`: Reusable UI components.
  - `pages/`: Application page components.
  - `hooks/`: Custom React hooks.
  - `lib/`: Utility functions and library configurations (e.g., queryClient).
  - `assets/`: Static assets like images and fonts.
  - `contexts/`: React context providers.
- `public/`: Static files served directly.

## Contributing

1.  Create a feature branch (`git checkout -b feature/amazing-feature`).
2.  Commit your changes (`git commit -m 'Add some amazing feature'`).
3.  Push to the branch (`git push origin feature/amazing-feature`).
4.  Open a Pull Request.