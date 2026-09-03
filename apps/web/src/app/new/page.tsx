import { redirect } from 'next/navigation';

/** `/new` is not a screen — it is the door to step one. */
export default function NewIndexPage(): never {
  redirect('/new/terms');
}
