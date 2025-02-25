"use client";

import { useParams } from "next/navigation";

export default function Page() {
  const { folderId } = useParams(); // folderId will be the dynamic part of the URL

  return (
    <div>
      <h1>Folder ID: {folderId}</h1>
      {/* Additional logic to display folder content */}
    </div>
  );
}
