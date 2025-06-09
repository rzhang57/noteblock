"use client";

import { useParams } from "next/navigation";

export default function Page() {
  const { folderId } = useParams();

  return (
    <div>
      <h1>Folder ID: {folderId}</h1>
      {/* Additional logic to display folder content */}
    </div>
  );
}
