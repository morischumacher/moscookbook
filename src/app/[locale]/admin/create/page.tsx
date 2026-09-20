import RecipeForm from '@/components/recipe-form/RecipeForm';
import { isAiImportConfigured } from '@/lib/aiImport';

export default function CreateRecipePage() {
    // Decided on the server: without an API key the AI tab is simply absent,
    // and paste-and-parse plus URL import carry the whole flow.
    return <RecipeForm mode="create" aiEnabled={isAiImportConfigured()} />;
}
