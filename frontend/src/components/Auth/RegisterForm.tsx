import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/services/api';
import { ArrowLeft } from 'lucide-react';

interface RegisterFormProps {
  countryCode: string;
  mobileNumber: string;
  onBack: () => void;
  onSuccess: () => void;
  hideHeader?: boolean;
}

export default function RegisterForm({ countryCode, mobileNumber, onBack, onSuccess, hideHeader = false }: RegisterFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await authApi.register({
        first_name: firstName,
        last_name: lastName,
        country_code: countryCode,
        mobile_number: mobileNumber,
      });
      onSuccess();
    } catch (error) {
      const apiError = error as Error;
      setError(apiError.message || 'Failed to register. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-2 mb-4">
          <Button onClick={onBack} variant="ghost" className="text-blue-700 hover:text-blue-800">
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </span>
          </Button>
          <h2 className="text-xl font-semibold text-gray-900">Complete registration</h2>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <div className="flex gap-2">
            <Input
              value={countryCode}
              disabled
              className="w-32 bg-gray-50"
            />
            <Input
              type="tel"
              value={mobileNumber}
              disabled
              className="flex-1 bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
            First Name
          </label>
          <Input
            type="text"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
            Last Name
          </label>
          <Input
            type="text"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || !firstName || !lastName}
          className="w-full"
        >
          {isSubmitting ? 'Registering...' : 'Register'}
        </Button>
      </form>
    </div>
  );
}
