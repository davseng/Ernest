import type { Asset } from "@/domain/assets";

export function AssetEditForm({ asset, action }: { asset: Asset; action: (data: FormData) => void | Promise<void> }) {
  return (
    <form className="record-form" action={action}>
      <div className="form-grid">
        <label>Name<input name="name" defaultValue={asset.name} maxLength={100} required /></label>
        <label>Type<select name="type" defaultValue={asset.type}><option value="Boat">Boat</option><option value="RV">RV</option></select></label>
        <label>Make<input name="make" defaultValue={asset.make} maxLength={100} required /></label>
        <label>Model<input name="model" defaultValue={asset.model} maxLength={100} required /></label>
        <label>Year<input name="year" type="number" min="1800" max="3000" step="1" defaultValue={asset.year} required /></label>
        <label>Registration / VIN <span>(optional)</span><input name="registrationNumber" defaultValue={asset.registrationNumber} maxLength={100} /></label>
      </div>
      <label>Summary<textarea name="summary" defaultValue={asset.summary} rows={5} maxLength={1000} required /></label>
      <button className="primary-button" type="submit">Save changes</button>
    </form>
  );
}
