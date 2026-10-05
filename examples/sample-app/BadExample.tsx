export function BadExample() {
  return (
    <div onClick={() => alert("clicked")}>
      <img src="/logo.png" />
      <button />
      <input placeholder="Email" />
      <a>Click here</a>
    </div>
  );
}
