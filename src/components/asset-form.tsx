import type { Asset } from "@/domain/assets";

export function AssetForm({ action, asset, submitLabel }: { action: (data: FormData) => void | Promise<void>; asset?: Asset; submitLabel: string }) {
  return <form className="record-form" action={action}>
    <div className="form-grid">
      <label>Name<input name="name" defaultValue={asset?.name} maxLength={100} required /></label>
      <label>Type<select name="type" defaultValue={asset?.type ?? "Boat"}><option>Boat</option><option>RV</option></select></label>
      <label>Make<input name="make" defaultValue={asset?.make} maxLength={100} required /></label>
      <label>Model<input name="model" defaultValue={asset?.model} maxLength={100} required /></label>
      <label>Year<input name="year" type="number" min="1800" max="3000" defaultValue={asset?.year} required /></label>
      <label>Registration / VIN <span>(optional)</span><input name="registrationNumber" defaultValue={asset?.registrationNumber} maxLength={100} /></label>
    </div>
    <label>Summary<textarea name="summary" defaultValue={asset?.summary} rows={5} maxLength={1000} required /></label>
    <button className="primary-button" type="submit">{submitLabel}</button>
  </form>;
}
