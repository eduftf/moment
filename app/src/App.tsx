import { useZoomSdk } from "./hooks/useZoomSdk";

export default function App() {
  const sdk = useZoomSdk();

  if (sdk.status === "loading") {
    return <div className="app"><p>Connecting to Zoom...</p></div>;
  }

  if (sdk.status === "error") {
    return (
      <div className="app">
        <p>Failed to connect: {sdk.error}</p>
        <p>Make sure this app is running inside Zoom.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Moment</h1>
      <p>Context: {sdk.runningContext}</p>
      <p>User: {sdk.userName} ({sdk.userRole})</p>
    </div>
  );
}
